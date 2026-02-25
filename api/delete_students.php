<?php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $data = json_decode(file_get_contents('php://input'), true);
    $rfids = $data['rfids'] ?? [];

    if (empty($rfids)) {
        http_response_code(400);
        echo json_encode(['error' => 'No RFID numbers provided']);
        exit;
    }

    $placeholders = implode(',', array_fill(0, count($rfids), '?'));
    $sql = "DELETE FROM students WHERE rfidNumber IN ($placeholders)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($rfids);

    echo json_encode(['success' => true, 'deletedCount' => $stmt->rowCount()]);
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
?>