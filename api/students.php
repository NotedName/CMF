<?php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->query('SELECT * FROM students ORDER BY dateTime DESC');
    $students = $stmt->fetchAll();
    echo json_encode($students);
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
?>