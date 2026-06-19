// contracts/PrescriptionRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IIdentityRegistry.sol";
import "./interfaces/IPrescriptionRegistry.sol";

contract PrescriptionRegistry is IPrescriptionRegistry {
    IIdentityRegistry public immutable identityRegistry;

    struct Prescription {
        // slot 0
        address doctor;           // 20 bytes
        uint64  issuedAt;         //  8 bytes
        uint8   refillsAllowed;   //  1 byte
        uint8   refillsUsed;      //  1 byte
        State   state;            //  1 byte
        // slot 1
        bytes32 patientRef;
        // slot 2
        bytes32 payloadHash;
        // slot 3
        uint64  expiresAt;        //  8 bytes
        uint32  totalUnits;       //  4 bytes
        uint32  dispensedUnits;   //  4 bytes
        // slot 4+
        string  cid;
    }

    mapping(bytes32 => Prescription) private _prescriptions;

    event PrescriptionIssued(
        bytes32 indexed prescriptionId, address indexed doctor,
        bytes32 indexed patientRef, string cid, bytes32 payloadHash,
        uint64 issuedAt, uint64 expiresAt, uint32 totalUnits
    );
    event PrescriptionDispensed(
        bytes32 indexed prescriptionId, address indexed pharmacist,
        uint32 units, uint32 dispensedUnits, State newState
    );
    event PrescriptionRefilled(bytes32 indexed prescriptionId, uint8 refillsUsed);
    event PrescriptionRevoked(bytes32 indexed prescriptionId, address indexed by);
    event PrescriptionExpired(bytes32 indexed prescriptionId);

    error NotAuthorized();
    error InvalidState();
    error ExceedsRemaining();
    error PrescriptionAlreadyExists();
    error InvalidParameters();

    modifier onlyActiveRole(bytes32 role) {
        if (!identityRegistry.isAuthorized(role, msg.sender)) revert NotAuthorized();
        _;
    }

    constructor(address _identityRegistry) {
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    function issuePrescription(
        bytes32 prescriptionId,
        bytes32 patientRef,
        string  calldata cid,
        bytes32 payloadHash,
        uint64  expiresAt,
        uint32  totalUnits,
        uint8   refillsAllowed
    ) external onlyActiveRole(identityRegistry.DOCTOR_ROLE()) {
        if (_prescriptions[prescriptionId].state != State.None) revert PrescriptionAlreadyExists();
        if (expiresAt <= block.timestamp) revert InvalidParameters();
        if (totalUnits == 0) revert InvalidParameters();
        if (payloadHash == bytes32(0)) revert InvalidParameters();
        if (bytes(cid).length == 0) revert InvalidParameters();

        _prescriptions[prescriptionId] = Prescription({
            doctor:         msg.sender,
            issuedAt:       uint64(block.timestamp),
            refillsAllowed: refillsAllowed,
            refillsUsed:    0,
            state:          State.ISSUED,
            patientRef:     patientRef,
            payloadHash:    payloadHash,
            expiresAt:      expiresAt,
            totalUnits:     totalUnits,
            dispensedUnits: 0,
            cid:            cid
        });

        emit PrescriptionIssued(
            prescriptionId, msg.sender, patientRef, cid, payloadHash,
            uint64(block.timestamp), expiresAt, totalUnits
        );
    }

    function dispense(bytes32 prescriptionId, uint32 units)
        external
        onlyActiveRole(identityRegistry.PHARMACIST_ROLE())
    {
        Prescription storage p = _prescriptions[prescriptionId];
        if (p.state != State.ISSUED && p.state != State.PARTIALLY_DISPENSED) revert InvalidState();
        if (block.timestamp > p.expiresAt) revert InvalidState();
        uint32 remaining = p.totalUnits - p.dispensedUnits;
        if (units == 0 || units > remaining) revert ExceedsRemaining();

        p.dispensedUnits += units;
        p.state = (p.dispensedUnits == p.totalUnits) ? State.FULLY_DISPENSED : State.PARTIALLY_DISPENSED;

        emit PrescriptionDispensed(prescriptionId, msg.sender, units, p.dispensedUnits, p.state);
    }

    function refill(bytes32 prescriptionId)
        external
        onlyActiveRole(identityRegistry.PHARMACIST_ROLE())
    {
        Prescription storage p = _prescriptions[prescriptionId];
        if (p.state != State.FULLY_DISPENSED) revert InvalidState();
        if (p.refillsUsed >= p.refillsAllowed) revert InvalidState();
        if (block.timestamp > p.expiresAt) revert InvalidState();

        p.refillsUsed += 1;
        p.dispensedUnits = 0;
        p.state = State.ISSUED;

        emit PrescriptionRefilled(prescriptionId, p.refillsUsed);
    }

    function revoke(bytes32 prescriptionId) external {
        Prescription storage p = _prescriptions[prescriptionId];
        if (p.state != State.ISSUED && p.state != State.PARTIALLY_DISPENSED) revert InvalidState();
        bool isIssuingDoctor = msg.sender == p.doctor;
        bool isAdmin = identityRegistry.isAuthorized(identityRegistry.ADMIN_ROLE(), msg.sender);
        if (!isIssuingDoctor && !isAdmin) revert NotAuthorized();

        p.state = State.REVOKED;
        emit PrescriptionRevoked(prescriptionId, msg.sender);
    }

    function markExpired(bytes32 prescriptionId) external {
        Prescription storage p = _prescriptions[prescriptionId];
        if (block.timestamp <= p.expiresAt) revert InvalidState();
        // Only non-terminal states may transition to EXPIRED (C9). FULLY_DISPENSED,
        // REVOKED, EXPIRED are terminal; None is the non-existence sentinel.
        if (p.state != State.ISSUED && p.state != State.PARTIALLY_DISPENSED) revert InvalidState();

        p.state = State.EXPIRED;
        emit PrescriptionExpired(prescriptionId);
    }

    function getPrescription(bytes32 prescriptionId) external view returns (PrescriptionView memory) {
        Prescription storage p = _prescriptions[prescriptionId];
        return PrescriptionView({
            doctor:         p.doctor,
            patientRef:     p.patientRef,
            cid:            p.cid,
            payloadHash:    p.payloadHash,
            issuedAt:       p.issuedAt,
            expiresAt:      p.expiresAt,
            totalUnits:     p.totalUnits,
            dispensedUnits: p.dispensedUnits,
            refillsAllowed: p.refillsAllowed,
            refillsUsed:    p.refillsUsed,
            state:          p.state
        });
    }

    function verify(bytes32 prescriptionId) external view returns (bool active) {
        Prescription storage p = _prescriptions[prescriptionId];
        return (p.state == State.ISSUED || p.state == State.PARTIALLY_DISPENSED)
            && block.timestamp <= p.expiresAt;
    }
}
