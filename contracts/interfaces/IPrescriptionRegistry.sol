// contracts/interfaces/IPrescriptionRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPrescriptionRegistry {
    enum State { None, ISSUED, PARTIALLY_DISPENSED, FULLY_DISPENSED, EXPIRED, REVOKED }

    struct PrescriptionView {
        address doctor;
        bytes32 patientRef;
        string  cid;
        bytes32 payloadHash;
        uint64  issuedAt;
        uint64  expiresAt;
        uint32  totalUnits;
        uint32  dispensedUnits;
        uint8   refillsAllowed;
        uint8   refillsUsed;
        State   state;
    }

    function getPrescription(bytes32 prescriptionId) external view returns (PrescriptionView memory);
    function verify(bytes32 prescriptionId) external view returns (bool active);
}
