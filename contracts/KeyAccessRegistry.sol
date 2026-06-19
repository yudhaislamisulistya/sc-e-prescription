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

        _checkGranter(p);

        // recipient must be: patientRef, the issuing doctor, or an active pharmacist (encoded as bytes32)
        bool recipientIsPatient    = (recipient == p.patientRef);
        bool recipientIsDoctor     = (recipient == bytes32(uint256(uint160(p.doctor))));
        bool recipientIsPharmacist = identityRegistry.isAuthorized(
            identityRegistry.PHARMACIST_ROLE(),
            address(uint160(uint256(recipient)))
        );

        if (!recipientIsPatient && !recipientIsDoctor && !recipientIsPharmacist) revert InvalidRecipient();

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

    function getWrappedKey(bytes32 prescriptionId, bytes32 recipient)
        external view returns (bytes memory)
    {
        return _wrappedKeys[prescriptionId][recipient];
    }

    function revokeAccess(bytes32 prescriptionId, bytes32 recipient) external {
        IPrescriptionRegistry.PrescriptionView memory p = prescriptionRegistry.getPrescription(prescriptionId);

        _checkGranter(p);

        delete _wrappedKeys[prescriptionId][recipient];
        emit AccessRevoked(prescriptionId, recipient, msg.sender);
    }
}
