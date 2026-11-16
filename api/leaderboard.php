<?php
/* GET api/leaderboard.php  ->  top 25 best-per-player scores (overall, by monster, by city, or combo). */
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET' && $_SERVER['REQUEST_METHOD'] !== 'HEAD') {
    header('Allow: GET, HEAD');
    kb_json(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$monsterId = null;
if (isset($_GET['monster_id']) && $_GET['monster_id'] !== '') {
    $m = is_string($_GET['monster_id']) ? trim($_GET['monster_id']) : '';
    if (!in_array($m, KB_MONSTERS, true)) {
        kb_json(['ok' => false, 'error' => 'Unknown monster_id.'], 422);
    }
    $monsterId = $m;
}

$cityId = null;
if (isset($_GET['city_id']) && $_GET['city_id'] !== '') {
    $c = is_string($_GET['city_id']) ? trim($_GET['city_id']) : '';
    if (!array_key_exists($c, KB_CITIES)) {
        kb_json(['ok' => false, 'error' => 'Unknown city_id.'], 422);
    }
    $cityId = $c;
}

$view = null;
if (isset($_GET['view']) && $_GET['view'] !== '') {
    $v = is_string($_GET['view']) ? trim($_GET['view']) : '';
    if (in_array($v, ['overall', 'monster', 'city'], true)) {
        $view = $v;
    }
}

$limit = KB_BOARD_SIZE;
if (isset($_GET['limit']) && is_string($_GET['limit']) && ctype_digit($_GET['limit'])) {
    $limit = max(1, min(KB_BOARD_SIZE, (int) $_GET['limit']));
}

try {
    $pdo = kb_db();
    $entries = kb_fetch_board($pdo, $monsterId, $cityId, $limit);
    $res = [
        'ok' => true,
        'filters' => [
            'monster_id' => $monsterId,
            'city_id' => $cityId,
        ],
        'entries' => $entries,
    ];
    if ($view !== null) {
        $res['view'] = $view;
    }
    kb_json($res);
} catch (Throwable $e) {
    kb_json(['ok' => false, 'error' => 'Could not read the leaderboard.'], 500);
}
