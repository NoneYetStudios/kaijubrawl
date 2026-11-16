<?php
/* CLI-only dev seeder for Kaiju Brawl leaderboard: seeds test rows across all (monster, city) combos. */
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Forbidden: CLI only.\n";
    exit(1);
}

require __DIR__ . '/db.php';

$players = [
    'ATOMICAL', 'KAIJU_KING', 'REEL_TERROR', 'B_MOVIE_ACE',
    'NEON_REX', 'MEGA_APE', 'MOTH_QUEEN', 'TIN_TITAN',
];

$pdo = kb_db();
$now = time();
$inserted = 0;

$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare(
        'INSERT INTO scores (player_name, name_key, monster_id, city_id, score, kos, buildings_wrecked, survival_time, created_at)
         VALUES (:n, :k, :m, :c, :s, :ko, :bw, :t, :ca)
         ON CONFLICT(name_key, monster_id, city_id) DO UPDATE SET
           player_name = excluded.player_name,
           score = MAX(scores.score, excluded.score),
           kos = CASE WHEN excluded.score > scores.score THEN excluded.kos ELSE scores.kos END,
           buildings_wrecked = CASE WHEN excluded.score > scores.score THEN excluded.buildings_wrecked ELSE scores.buildings_wrecked END,
           survival_time = CASE WHEN excluded.score > scores.score THEN excluded.survival_time ELSE scores.survival_time END,
           created_at = CASE WHEN excluded.score > scores.score THEN excluded.created_at ELSE scores.created_at END'
    );

    $mIdx = 0;
    foreach (KB_MONSTERS as $monsterId) {
        $cIdx = 0;
        foreach (KB_CITIES as $cityId => $bldgCount) {
            for ($p = 0; $p < 3; $p++) {
                $name = $players[($mIdx * 2 + $cIdx + $p) % count($players)];
                $nameKey = strtolower($name);
                $kos = 2 + (($mIdx + $cIdx + $p) % 7);
                $survivalTime = 90 + $kos * 28 + $p * 17;
                $maxBld = ($kos + 1) * $bldgCount;
                $wrecked = min($maxBld, 8 + $kos * 4 + $p * 3);
                $score = $kos * 1000 + $wrecked * 110 + $survivalTime * 5 + 350 - $p * 120;
                $createdAt = $now - (3600 - ($mIdx * 300 + $cIdx * 90 + $p * 20));

                $stmt->execute([
                    ':n' => $name,
                    ':k' => $nameKey,
                    ':m' => $monsterId,
                    ':c' => $cityId,
                    ':s' => $score,
                    ':ko' => $kos,
                    ':bw' => $wrecked,
                    ':t' => $survivalTime,
                    ':ca' => $createdAt,
                ]);
                $inserted++;
            }
            $cIdx++;
        }
        $mIdx++;
    }
    $pdo->commit();
    echo "Seeded {$inserted} score rows across " . count(KB_MONSTERS) . " monsters x " . count(KB_CITIES) . " cities.\n";
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, 'Seed failed: ' . $e->getMessage() . "\n");
    exit(1);
}
