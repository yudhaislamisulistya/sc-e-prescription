// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract EPrescription {
    struct Prescription {
        address doctor;
        address patient;
        string medication;
        uint256 timestamp;
        bool isValid;
    }

    mapping(bytes32 => Prescription) public prescriptions;

    event PrescriptionCreated(bytes32 indexed id, address indexed doctor, address indexed patient);

    function createPrescription(address patient, string calldata medication) external returns (bytes32) {
        bytes32 id = keccak256(abi.encodePacked(msg.sender, patient, medication, block.timestamp));
        prescriptions[id] = Prescription({
            doctor: msg.sender,
            patient: patient,
            medication: medication,
            timestamp: block.timestamp,
            isValid: true
        });
        emit PrescriptionCreated(id, msg.sender, patient);
        return id;
    }

    function invalidatePrescription(bytes32 id) external {
        require(msg.sender == prescriptions[id].doctor, "Unauthorized");
        prescriptions[id].isValid = false;
    }

    function verifyPrescription(bytes32 id) external view returns (bool) {
        return prescriptions[id].isValid;
    }
}