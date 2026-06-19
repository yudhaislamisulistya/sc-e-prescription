// contracts/interfaces/IIdentityRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIdentityRegistry {
    enum ActorStatus { Active, Suspended, Revoked }

    function isAuthorized(bytes32 role, address account) external view returns (bool);
    function getEncryptionPubKeyByAddress(address actor) external view returns (bytes memory);
    function getEncryptionPubKeyByRef(bytes32 patientRef) external view returns (bytes memory);
    function ADMIN_ROLE() external view returns (bytes32);
    function DOCTOR_ROLE() external view returns (bytes32);
    function PHARMACIST_ROLE() external view returns (bytes32);
    function PATIENT_CUSTODIAN_ROLE() external view returns (bytes32);
    function getPatientCustodian(bytes32 patientRef) external view returns (address);
}
