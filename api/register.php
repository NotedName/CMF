<?php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);

    $sql = "INSERT INTO students (rfidNumber, name, program, yearLevel, studentNumber, dateTime, semester, academicYear, clearanceStatus)
            VALUES (:rfid, :name, :program, :yearLevel, :studentNumber, :dateTime, :semester, :academicYear, :status)";
    $stmt = $pdo->prepare($sql);

    try {
        $stmt->execute([
            ':rfid'          => $data['rfidNumber'],
            ':name'          => $data['name'],
            ':program'       => $data['program'],
            ':yearLevel'     => $data['yearLevel'],
            ':studentNumber' => $data['studentNumber'],
            ':dateTime'      => $data['dateTime'],
            ':semester'      => $data['semester'],
            ':academicYear'  => $data['academicYear'],
            ':status'        => $data['clearanceStatus']
        ]);
        echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
    } catch (PDOException $e) {
        if ($e->errorInfo[1] == 1062) { // duplicate entry
            http_response_code(400);
            echo json_encode(['error' => 'RFID number already exists']);
        } else {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
?>