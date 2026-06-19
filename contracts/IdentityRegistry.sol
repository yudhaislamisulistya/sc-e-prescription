// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract IdentityRegistry is AccessControl {
    bytes32 public constant ADMIN_ROLE             = keccak256("ADMIN_ROLE");
    bytes32 public constant DOCTOR_ROLE            = keccak256("DOCTOR_ROLE");
    bytes32 public constant PHARMACIST_ROLE        = keccak256("PHARMACIST_ROLE");
    bytes32 public constant PATIENT_CUSTODIAN_ROLE = keccak256("PATIENT_CUSTODIAN_ROLE");

    enum ActorStatus { Active, Suspended, Revoked }

    struct Actor {
        bytes32     licenseHash;
        bytes32     institutionId;
        bytes       encryptionPubKey;
        ActorStatus status;
        bytes32     role;
    }

    struct Patient {
        bytes   encryptionPubKey;
        address custodian;
        bool    registered;
    }

    mapping(address => Actor)   private _actors;
    mapping(bytes32 => Patient) private _patients;

    event ActorRegistered(address indexed actor, bytes32 indexed role, bytes32 institutionId, bytes32 licenseHash);
    event ActorStatusChanged(address indexed actor, ActorStatus oldStatus, ActorStatus newStatus);
    event PatientRegistered(bytes32 indexed patientRef, address indexed custodian);

    constructor(address initialAdmin) {
        require(initialAdmin != address(0), "IR: zero admin");
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(ADMIN_ROLE, initialAdmin);
        _setRoleAdmin(DOCTOR_ROLE, ADMIN_ROLE);
        _setRoleAdmin(PHARMACIST_ROLE, ADMIN_ROLE);
        _setRoleAdmin(PATIENT_CUSTODIAN_ROLE, ADMIN_ROLE);
    }

    function registerActor(
        address actor,
        bytes32 role,
        bytes32 licenseHash,
        bytes32 institutionId,
        bytes calldata encryptionPubKey
    ) external onlyRole(ADMIN_ROLE) {
        require(
            role == DOCTOR_ROLE || role == PHARMACIST_ROLE || role == PATIENT_CUSTODIAN_ROLE,
            "IR: invalid role"
        );
        require(encryptionPubKey.length > 0, "IR: empty pubkey");
        _grantRole(role, actor);
        _actors[actor] = Actor({
            licenseHash:      licenseHash,
            institutionId:    institutionId,
            encryptionPubKey: encryptionPubKey,
            status:           ActorStatus.Active,
            role:             role
        });
        emit ActorRegistered(actor, role, institutionId, licenseHash);
    }

    function setActorStatus(address actor, ActorStatus status) external onlyRole(ADMIN_ROLE) {
        ActorStatus old = _actors[actor].status;
        _actors[actor].status = status;
        emit ActorStatusChanged(actor, old, status);
    }

    function registerPatient(
        bytes32 patientRef,
        bytes calldata encryptionPubKey,
        address custodian
    ) external onlyRole(ADMIN_ROLE) {
        require(encryptionPubKey.length > 0, "IR: empty pubkey");
        require(custodian != address(0), "IR: zero custodian");
        _patients[patientRef] = Patient({
            encryptionPubKey: encryptionPubKey,
            custodian:        custodian,
            registered:       true
        });
        emit PatientRegistered(patientRef, custodian);
    }

    function isAuthorized(bytes32 role, address account) external view returns (bool) {
        return hasRole(role, account) && _actors[account].status == ActorStatus.Active;
    }

    function getEncryptionPubKeyByAddress(address actor) external view returns (bytes memory) {
        return _actors[actor].encryptionPubKey;
    }

    function getEncryptionPubKeyByRef(bytes32 patientRef) external view returns (bytes memory) {
        return _patients[patientRef].encryptionPubKey;
    }

    function getPatientCustodian(bytes32 patientRef) external view returns (address) {
        return _patients[patientRef].custodian;
    }
}
