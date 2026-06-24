// contracts/KeyAccessRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IIdentityRegistry.sol";
import "./interfaces/IPrescriptionRegistry.sol";

contract KeyAccessRegistry {
    IIdentityRegistry     public immutable identityRegistry;
    IPrescriptionRegistry public immutable prescriptionRegistry;

    // prescriptionId => recipient(bytes32) => wrappedKey
    mapping(bytes32 => mapping(bytes32 => bytes)) private _wrappedKeys;

    event AccessGranted(bytes32 indexed prescriptionId, bytes32 indexed recipient, address indexed grantedBy);
    event AccessRevoked(bytes32 indexed prescriptionId, bytes32 indexed recipient, address indexed revokedBy);

    error NotAuthorized();
    error InvalidRecipient();
    error PrescriptionDoesNotExist();
    error AccessAlreadyGranted();

    constructor(address _identityRegistry, address _prescriptionRegistry) {
        identityRegistry     = IIdentityRegistry(_identityRegistry);
        prescriptionRegistry = IPrescriptionRegistry(_prescriptionRegistry);
    }

    function grantAccess(
        bytes32 prescriptionId,
        bytes32 recipient,
        bytes calldata wrappedKey
    ) external {
        IPrescriptionRegistry.PrescriptionView memory p = prescriptionRegistry.getPrescription(prescriptionId);

        // FINDING 2/3: a prescription that was never issued has state None and a
        // zeroed doctor/patientRef. Writing access state for it is an illegal
        // transition; reject up front so no granter (including admin) can pollute
        // the registry with keys for phantom prescriptions.
        if (p.state == IPrescriptionRegistry.State.None) revert PrescriptionDoesNotExist();

        _checkGranter(p);

        // FINDING 3: never accept the zero recipient. For a real prescription the
        // patientRef and doctor are both non-zero, so 0 can only be an attempt to
        // exploit a collision; reject it explicitly.
        if (recipient == bytes32(0)) revert InvalidRecipient();

        // recipient must be: the patientRef, the issuing doctor, or an active
        // pharmacist (each encoded as bytes32).
        if (!_isEligibleRecipient(p, recipient)) revert InvalidRecipient();

        // FINDING 5: do not silently overwrite an existing wrapped key. An
        // authorized-but-malicious granter could otherwise replace a correctly
        // wrapped key with garbage (DoS on decryption) while still emitting a
        // normal AccessGranted event. Require an explicit revokeAccess first.
        if (_wrappedKeys[prescriptionId][recipient].length != 0) revert AccessAlreadyGranted();

        _wrappedKeys[prescriptionId][recipient] = wrappedKey;
        emit AccessGranted(prescriptionId, recipient, msg.sender);
    }

    /// @dev Reverts unless msg.sender is the issuing doctor, the patient's active
    ///      custodian, or an active admin. Shared by grantAccess and revokeAccess.
    function _checkGranter(IPrescriptionRegistry.PrescriptionView memory p) private view {
        bool isIssuingDoctor = (msg.sender == p.doctor);
        bool isCustodian = identityRegistry.isAuthorized(identityRegistry.PATIENT_CUSTODIAN_ROLE(), msg.sender)
            && identityRegistry.getPatientCustodian(p.patientRef) == msg.sender;
        bool isAdmin = identityRegistry.isAuthorized(identityRegistry.ADMIN_ROLE(), msg.sender);

        if (!isIssuingDoctor && !isCustodian && !isAdmin) revert NotAuthorized();
    }

    /// @dev Returns whether `recipient` is an eligible target for a wrapped key on
    ///      prescription `p`: the patientRef, the issuing doctor, or a
    ///      currently-active pharmacist.
    ///
    ///      FINDING 1: the pharmacist identity lives in a 160-bit address space but
    ///      `recipient` is a 256-bit storage key. Without a canonicality guard, an
    ///      attacker could supply `(arbitraryHighBits << 160) | pharmacistAddr`,
    ///      which still validates as the pharmacist (low 160 bits) yet stores the
    ///      key under a non-canonical slot the pharmacist will never read. We require
    ///      the high 96 bits to be zero so the validated address and the storage key
    ///      are bijective for the actor-address encoding.
    function _isEligibleRecipient(
        IPrescriptionRegistry.PrescriptionView memory p,
        bytes32 recipient
    ) private view returns (bool) {
        if (recipient == p.patientRef) return true;

        // Doctor encoding is the canonical left-padded address; equality is on the
        // full 256 bits so no truncation gap exists here.
        if (recipient == bytes32(uint256(uint160(p.doctor)))) return true;

        // Actor-address (pharmacist) branch: only canonical left-padded addresses
        // are accepted, so the validated address is exactly the storage key.
        if (uint256(recipient) >> 160 == 0) {
            address recipientAddr = address(uint160(uint256(recipient)));
            if (identityRegistry.isAuthorized(identityRegistry.PHARMACIST_ROLE(), recipientAddr)) {
                return true;
            }
        }

        return false;
    }

    function getWrappedKey(bytes32 prescriptionId, bytes32 recipient)
        external view returns (bytes memory)
    {
        bytes storage wrapped = _wrappedKeys[prescriptionId][recipient];
        if (wrapped.length == 0) return wrapped;

        // FINDING 4: gate reads so that deauthorizing an actor immediately cuts off
        // their decryption access without requiring an explicit revokeAccess call.
        // The patientRef and the issuing doctor are bound to the prescription and
        // always remain readable; a pharmacist recipient must STILL be an active
        // pharmacist (role + Active status) at read time. If a previously-granted
        // pharmacist is later Suspended/Revoked or loses the role, the key is no
        // longer retrievable.
        IPrescriptionRegistry.PrescriptionView memory p = prescriptionRegistry.getPrescription(prescriptionId);

        if (recipient == p.patientRef) return wrapped;
        if (recipient == bytes32(uint256(uint160(p.doctor)))) return wrapped;

        // Remaining case: recipient was granted as a pharmacist. Re-validate it is a
        // canonical address that is currently an active pharmacist.
        if (uint256(recipient) >> 160 == 0) {
            address recipientAddr = address(uint160(uint256(recipient)));
            if (identityRegistry.isAuthorized(identityRegistry.PHARMACIST_ROLE(), recipientAddr)) {
                return wrapped;
            }
        }

        // No longer authorized: return empty rather than leaking the wrapped key.
        return bytes("");
    }

    function revokeAccess(bytes32 prescriptionId, bytes32 recipient) external {
        IPrescriptionRegistry.PrescriptionView memory p = prescriptionRegistry.getPrescription(prescriptionId);

        // FINDING 2: same existence guard as grantAccess - never mutate access
        // state for a prescription that was never issued.
        if (p.state == IPrescriptionRegistry.State.None) revert PrescriptionDoesNotExist();

        _checkGranter(p);

        delete _wrappedKeys[prescriptionId][recipient];
        emit AccessRevoked(prescriptionId, recipient, msg.sender);
    }
}
