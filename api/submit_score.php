<?php
/* POST api/submit_score.php
 * Body: {"player_name":"...","score":1234,"monster_id":"gorgantor","city_id":"pinebrook","kos":3,"buildings_wrecked":14,"survival_time":95}
 *
 * Duplicate handling: one row per (player name case-insensitive, monster_id, city_id) combo.
 * Updates only if score is higher (or equal with higher kos, then higher survival_time).
 */
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    kb_json(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$raw = file_get_contents('php://input', false, null, 0, 4096);
$in = [];
if ($raw !== false && $raw !== '') {
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
        $in = $decoded;
    }
}
if (!$in && !empty($_POST)) {
    $in = $_POST;
}

/* ---- Validation ---- */
$rawName = $in['player_name'] ?? ($in['name'] ?? null);
$playerName = is_string($rawName) ? trim((string) preg_replace('/\s+/', ' ', $rawName)) : '';
if ($playerName === '' || strlen($playerName) > 12 || !preg_match('/^[A-Za-z0-9 _.\-!?]+$/', $playerName)) {
    kb_json(['ok' => false, 'error' => 'Name must be 1-12 characters: letters, numbers, spaces and _ . - ! ?'], 422);
}

$monsterId = is_string($in['monster_id'] ?? null) ? trim($in['monster_id']) : '';
if (!in_array($monsterId, KB_MONSTERS, true)) {
    kb_json(['ok' => false, 'error' => 'Unknown monster_id.'], 422);
}

$cityId = is_string($in['city_id'] ?? null) ? trim($in['city_id']) : '';
if (!array_key_exists($cityId, KB_CITIES)) {
    kb_json(['ok' => false, 'error' => 'Unknown city_id.'], 422);
}

function kb_int($v): ?int
{
    if (is_int($v)) {
        return $v;
    }
    if (is_string($v) && preg_match('/^\d{1,9}$/', $v)) {
        return (int) $v;
    }
    if (is_float($v) && $v >= 0 && $v < 1e9 && floor($v) == $v) {
        return (int) $v;
    }
    return null;
}

$score = kb_int($in['score'] ?? null);
$kos = kb_int($in['kos'] ?? null);
$buildingsWrecked = kb_int($in['buildings_wrecked'] ?? null);
$survivalTime = kb_int($in['survival_time'] ?? ($in['time'] ?? null));

if ($score === null || $kos === null || $buildingsWrecked === null || $survivalTime === null) {
    kb_json(['ok' => false, 'error' => 'Score, KOs, buildings wrecked, and survival time must be whole numbers.'], 422);
}
if (
    $score < 0 || $score > 5000000 ||
    $kos < 0 || $kos > 500 ||
    $buildingsWrecked < 0 || $buildingsWrecked > 20000 ||
    $survivalTime < 1 || $survivalTime > 7200
) {
    kb_json(['ok' => false, 'error' => 'Submitted run stats are out of range.'], 422);
}

// Plausibility checks (mirroring PLAN.md §8.5)
if ($kos > (int) floor($survivalTime / 5) + 1) {
    kb_json(['ok' => false, 'error' => 'KO count implausible for survival time.'], 422);
}
if ($buildingsWrecked > ($kos + 1) * KB_CITIES[$cityId]) {
    kb_json(['ok' => false, 'error' => 'Buildings wrecked implausible for KO count and city size.'], 422);
}
if ($score > $kos * 2000 + $buildingsWrecked * 200 + $survivalTime * 8 + 500) {
    kb_json(['ok' => false, 'error' => 'Score failed plausibility validation.'], 422);
}

$nameKey = strtolower($playerName);
$now = time();

try {
    $pdo = kb_db();

    /* ---- Rate limit per IP ---- */
    $ipHash = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . '|kaijubrawl');
    $pdo->exec('DELETE FROM rate_limit WHERE last_submit < ' . ($now - 3600));
    $st = $pdo->prepare('SELECT last_submit FROM rate_limit WHERE ip_hash = :h');
    $st->execute([':h' => $ipHash]);
    $last = $st->fetchColumn();
    if ($last !== false && ($now - (int) $last) < KB_MIN_SUBMIT_GAP) {
        kb_json(['ok' => false, 'error' => 'Slow down! Please wait a few seconds between submissions.'], 429);
    }

    $pdo->beginTransaction();
    $pdo->prepare('INSERT OR REPLACE INTO rate_limit (ip_hash, last_submit) VALUES (:h, :t)')
        ->execute([':h' => $ipHash, ':t' => $now]);

    $st = $pdo->prepare(
        'SELECT id, player_name, score, kos, buildings_wrecked, survival_time, created_at
         FROM scores
         WHERE name_key = :k AND monster_id = :m AND city_id = :c'
    );
    $st->execute([':k' => $nameKey, ':m' => $monsterId, ':c' => $cityId]);
    $existing = $st->fetch();

    if (!$existing) {
        $pdo->prepare(
            'INSERT INTO scores (player_name, name_key, monster_id, city_id, score, kos, buildings_wrecked, survival_time, created_at)
             VALUES (:n, :k, :m, :c, :s, :ko, :bw, :t, :ca)'
        )->execute([
            ':n' => $playerName,
            ':k' => $nameKey,
            ':m' => $monsterId,
            ':c' => $cityId,
            ':s' => $score,
            ':ko' => $kos,
            ':bw' => $buildingsWrecked,
            ':t' => $survivalTime,
            ':ca' => $now,
        ]);
        $rowId = (int) $pdo->lastInsertId();
        $status = 'new';
        $best = [$playerName, $monsterId, $cityId, $score, $kos, $buildingsWrecked, $survivalTime, $now];
    } elseif (
        $score > (int) $existing['score'] ||
        ($score === (int) $existing['score'] && $kos > (int) $existing['kos']) ||
        ($score === (int) $existing['score'] && $kos === (int) $existing['kos'] && $survivalTime > (int) $existing['survival_time'])
    ) {
        $rowId = (int) $existing['id'];
        $pdo->prepare(
            'UPDATE scores
             SET player_name = :n, score = :s, kos = :ko, buildings_wrecked = :bw, survival_time = :t, created_at = :ca
             WHERE id = :id'
        )->execute([
            ':n' => $playerName,
            ':s' => $score,
            ':ko' => $kos,
            ':bw' => $buildingsWrecked,
            ':t' => $survivalTime,
            ':ca' => $now,
            ':id' => $rowId,
        ]);
        $status = 'improved';
        $best = [$playerName, $monsterId, $cityId, $score, $kos, $buildingsWrecked, $survivalTime, $now];
    } else {
        $rowId = (int) $existing['id'];
        $status = (
            $score === (int) $existing['score'] &&
            $kos === (int) $existing['kos'] &&
            $buildingsWrecked === (int) $existing['buildings_wrecked'] &&
            $survivalTime === (int) $existing['survival_time']
        ) ? 'duplicate' : 'not_improved';
        $best = [
            $existing['player_name'],
            $monsterId,
            $cityId,
            (int) $existing['score'],
            (int) $existing['kos'],
            (int) $existing['buildings_wrecked'],
            (int) $existing['survival_time'],
            (int) $existing['created_at'],
        ];
    }

    // Retain only the top KB_MAX_ROWS_PER_COMBO rows for this (monster, city) combo.
    $prune = $pdo->prepare(
        'DELETE FROM scores
         WHERE monster_id = :m AND city_id = :c
           AND id NOT IN (
             SELECT id FROM scores
             WHERE monster_id = :m2 AND city_id = :c2
             ORDER BY score DESC, kos DESC, survival_time DESC, created_at ASC, id ASC
             LIMIT :lim
           )'
    );
    $prune->bindValue(':m', $monsterId, PDO::PARAM_STR);
    $prune->bindValue(':c', $cityId, PDO::PARAM_STR);
    $prune->bindValue(':m2', $monsterId, PDO::PARAM_STR);
    $prune->bindValue(':c2', $cityId, PDO::PARAM_STR);
    $prune->bindValue(':lim', KB_MAX_ROWS_PER_COMBO, PDO::PARAM_INT);
    $prune->execute();
    $pdo->commit();

    $rankOverall = kb_rank($pdo, $nameKey, $best[3], $best[4], $best[6], $best[7], $rowId, null, null);
    $rankMonster = kb_rank($pdo, $nameKey, $best[3], $best[4], $best[6], $best[7], $rowId, $monsterId, null);
    $rankCity = kb_rank($pdo, $nameKey, $best[3], $best[4], $best[6], $best[7], $rowId, null, $cityId);

    kb_json([
        'ok' => true,
        'status' => $status,
        'rank_overall' => $rankOverall,
        'rank_monster' => $rankMonster,
        'rank_city' => $rankCity,
        'best' => [
            'player_name' => $best[0],
            'monster_id' => $best[1],
            'city_id' => $best[2],
            'score' => $best[3],
            'kos' => $best[4],
            'buildings_wrecked' => $best[5],
            'survival_time' => $best[6],
        ],
    ]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    kb_json(['ok' => false, 'error' => 'Could not save your score. Please try again.'], 500);
}
