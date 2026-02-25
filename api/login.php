<?php
session_start();
require_once 'config.php'; // your existing DB connection

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$username = $data['username'] ?? '';
$password = $data['password'] ?? '';

// Hardcoded admin credentials
$hardcoded_username = 'admin';
$hardcoded_password = 'admin1';

if ($username === $hardcoded_username && $password === $hardcoded_password) {
    // Login successful with hardcoded admin
    $_SESSION['user_id'] = 1;          // you can set a dummy id
    $_SESSION['username'] = $username;
    echo json_encode(['success' => true]);
    exit;
}

// If not hardcoded admin, check the database
$stmt = $pdo->prepare('SELECT * FROM users WHERE username = ?');
$stmt->execute([$username]);
$user = $stmt->fetch();

if ($user && password_verify($password, $user['password_hash'])) {
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    echo json_encode(['success' => true]);
} else {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid username or password']);
}
?>