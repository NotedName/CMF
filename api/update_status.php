<?php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $data = json_decode(file_get_contents('php://input'), true);

    // The URL might be like /api/update_status.php?rfid=...
    // We'll read rfid from query string or body
    $rfid = $_GET['rfid'] ?? $data['rfid'] ?? null;
    $status = $data['status'] ?? null;

    if (!$rfid || !$status) {
        http_response_code(400);
        echo json_encode(['error' => 'RFID and status required']);
        exit;
    }

    $stmt = $pdo->prepare('UPDATE students SET clearanceStatus = ? WHERE rfidNumber = ?');
    $stmt->execute([$status, $rfid]);

    if ($stmt->rowCount() > 0) {
        echo json_encode(['success' => true]);
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Student not found']);
    }
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
?>