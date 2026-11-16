<?php
/* Kaiju Brawl - shared leaderboard helpers (PHP 7.4+, SQLite via PDO). */

// Never leak PHP warnings/notices/PDO details to clients (display_errors off assumption).
@ini_set('display_errors', '0');
@ini_set('html_errors', '0');
error_reporting(E_ALL);

const KB_DB_PATH = __DIR__ . '/../data/leaderboard.sqlite';
const KB_BOARD_SIZE = 25;            // rows shown on the leaderboard
const KB_MAX_ROWS_PER_COMBO = 100;   // per (monster, city) combination kept
const KB_MIN_SUBMIT_GAP = 3;         // seconds between submissions per IP
const KB_MONSTERS = ['gorgantor', 'mongo', 'lepidora', 'tin_colossus', 'octopulus', 'brain_fiend'];
const KB_CITIES = [                  // id => number of buildings (used for plausibility)
    'pinebrook' => 18,
    'atom_city' => 16,
    'metro_heights' => 14,
    'caldera_isle' => 14,
    'harbor_pier' => 15,
];

function kb_json(array $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function kb_db(): PDO
{
    if (!extension_loaded('pdo_sqlite')) {
        kb_json(['ok' => false, 'error' => 'Server is missing the pdo_sqlite PHP extension.'], 500);
    }
    $dir = dirname(KB_DB_PATH);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    try {
        $pdo = new PDO('sqlite:' . KB_DB_PATH);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA busy_timeout = 4000');
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_name TEXT NOT NULL,
                name_key TEXT NOT NULL,
                monster_id TEXT NOT NULL,
                city_id TEXT NOT NULL,
                score INTEGER NOT NULL,
                kos INTEGER NOT NULL,
                buildings_wrecked INTEGER NOT NULL,
                survival_time INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE (name_key, monster_id, city_id)
            )'
        );
        $pdo->exec(
            'CREATE INDEX IF NOT EXISTS idx_scores_rank
             ON scores (score DESC, kos DESC, survival_time DESC, created_at ASC)'
        );
        $pdo->exec(
            'CREATE INDEX IF NOT EXISTS idx_scores_monster
             ON scores (monster_id, score DESC)'
        );
        $pdo->exec(
            'CREATE INDEX IF NOT EXISTS idx_scores_city
             ON scores (city_id, score DESC)'
        );
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS rate_limit (
                ip_hash TEXT PRIMARY KEY,
                last_submit INTEGER NOT NULL
            )'
        );
        return $pdo;
    } catch (Throwable $e) {
        kb_json(['ok' => false, 'error' => 'Leaderboard database unavailable. Is the data/ folder writable?'], 500);
    }
    return new PDO('sqlite::memory:'); // unreachable
}

function kb_supports_window_functions(PDO $pdo): bool
{
    $ver = (string) $pdo->query('SELECT sqlite_version()')->fetchColumn();
    return version_compare($ver, '3.25.0', '>=');
}

/** Fetch best-per-player leaderboard entries within an optional (monster_id, city_id) filter scope. */
function kb_fetch_board(PDO $pdo, ?string $monsterId, ?string $cityId, int $limit): array
{
    if (kb_supports_window_functions($pdo)) {
        $sql = 'WITH f AS (
                    SELECT * FROM scores
                    WHERE (:m IS NULL OR monster_id = :m2)
                      AND (:c IS NULL OR city_id = :c2)
                ), best AS (
                    SELECT *, ROW_NUMBER() OVER (
                        PARTITION BY name_key
                        ORDER BY score DESC, kos DESC, survival_time DESC, created_at ASC, id ASC
                    ) AS rn
                    FROM f
                )
                SELECT player_name, monster_id, city_id, score, kos, buildings_wrecked, survival_time, created_at
                FROM best
                WHERE rn = 1
                ORDER BY score DESC, kos DESC, survival_time DESC, created_at ASC, id ASC
                LIMIT :n';
        $st = $pdo->prepare($sql);
        $st->bindValue(':m', $monsterId, $monsterId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':m2', $monsterId, $monsterId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':c', $cityId, $cityId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':c2', $cityId, $cityId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':n', $limit, PDO::PARAM_INT);
    } else {
        $sql = 'SELECT a.player_name, a.monster_id, a.city_id, a.score, a.kos, a.buildings_wrecked, a.survival_time, a.created_at
                FROM scores a
                WHERE (:m IS NULL OR a.monster_id = :m2)
                  AND (:c IS NULL OR a.city_id = :c2)
                  AND NOT EXISTS (
                    SELECT 1 FROM scores b
                    WHERE b.name_key = a.name_key
                      AND (:m3 IS NULL OR b.monster_id = :m4)
                      AND (:c3 IS NULL OR b.city_id = :c4)
                      AND (
                        b.score > a.score
                        OR (b.score = a.score AND (
                            b.kos > a.kos
                            OR (b.kos = a.kos AND (
                                b.survival_time > a.survival_time
                                OR (b.survival_time = a.survival_time AND (
                                    b.created_at < a.created_at
                                    OR (b.created_at = a.created_at AND b.id < a.id)
                                ))
                            ))
                        ))
                      )
                  )
                ORDER BY a.score DESC, a.kos DESC, a.survival_time DESC, a.created_at ASC, a.id ASC
                LIMIT :n';
        $st = $pdo->prepare($sql);
        $st->bindValue(':m', $monsterId, $monsterId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':m2', $monsterId, $monsterId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':m3', $monsterId, $monsterId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':m4', $monsterId, $monsterId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':c', $cityId, $cityId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':c2', $cityId, $cityId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':c3', $cityId, $cityId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':c4', $cityId, $cityId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':n', $limit, PDO::PARAM_INT);
    }

    $st->execute();

    $entries = [];
    $rank = 1;
    foreach ($st->fetchAll() as $row) {
        $entries[] = [
            'rank' => $rank++,
            'player_name' => $row['player_name'],
            'monster_id' => $row['monster_id'],
            'city_id' => $row['city_id'],
            'score' => (int) $row['score'],
            'kos' => (int) $row['kos'],
            'buildings_wrecked' => (int) $row['buildings_wrecked'],
            'survival_time' => (int) $row['survival_time'],
            'created_at' => (int) $row['created_at'],
        ];
    }
    return $entries;
}

/** 1-based best-per-player rank of a player within the given filter scope. */
function kb_rank(
    PDO $pdo,
    string $nameKey,
    int $fallbackScore,
    int $fallbackKos,
    int $fallbackTime,
    int $fallbackCreated,
    int $fallbackId,
    ?string $monsterId = null,
    ?string $cityId = null
): int {
    // Resolve the player's actual best row in this filter scope so rank matches GET leaderboard.php.
    $selfSt = $pdo->prepare(
        'SELECT id, score, kos, survival_time, created_at
         FROM scores
         WHERE name_key = :nk
           AND (:m IS NULL OR monster_id = :m2)
           AND (:c IS NULL OR city_id = :c2)
         ORDER BY score DESC, kos DESC, survival_time DESC, created_at ASC, id ASC
         LIMIT 1'
    );
    $selfSt->bindValue(':nk', $nameKey, PDO::PARAM_STR);
    $selfSt->bindValue(':m', $monsterId, $monsterId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $selfSt->bindValue(':m2', $monsterId, $monsterId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $selfSt->bindValue(':c', $cityId, $cityId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $selfSt->bindValue(':c2', $cityId, $cityId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $selfSt->execute();
    $self = $selfSt->fetch();

    $s = $self ? (int) $self['score'] : $fallbackScore;
    $k = $self ? (int) $self['kos'] : $fallbackKos;
    $t = $self ? (int) $self['survival_time'] : $fallbackTime;
    $ca = $self ? (int) $self['created_at'] : $fallbackCreated;
    $rid = $self ? (int) $self['id'] : $fallbackId;

    if (kb_supports_window_functions($pdo)) {
        $sql = 'WITH f AS (
                    SELECT * FROM scores
                    WHERE (:m IS NULL OR monster_id = :m2)
                      AND (:c IS NULL OR city_id = :c2)
                ), best AS (
                    SELECT *, ROW_NUMBER() OVER (
                        PARTITION BY name_key
                        ORDER BY score DESC, kos DESC, survival_time DESC, created_at ASC, id ASC
                    ) AS rn
                    FROM f
                )
                SELECT COUNT(*) FROM best
                WHERE rn = 1
                  AND (
                    score > :s
                    OR (score = :s2 AND kos > :k)
                    OR (score = :s3 AND kos = :k2 AND survival_time > :t)
                    OR (score = :s4 AND kos = :k3 AND survival_time = :t2 AND created_at < :ca)
                    OR (score = :s5 AND kos = :k4 AND survival_time = :t3 AND created_at = :ca2 AND id < :id)
                  )';
        $st = $pdo->prepare($sql);
        $st->bindValue(':m', $monsterId, $monsterId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':m2', $monsterId, $monsterId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':c', $cityId, $cityId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':c2', $cityId, $cityId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':s', $s, PDO::PARAM_INT);
        $st->bindValue(':s2', $s, PDO::PARAM_INT);
        $st->bindValue(':s3', $s, PDO::PARAM_INT);
        $st->bindValue(':s4', $s, PDO::PARAM_INT);
        $st->bindValue(':s5', $s, PDO::PARAM_INT);
        $st->bindValue(':k', $k, PDO::PARAM_INT);
        $st->bindValue(':k2', $k, PDO::PARAM_INT);
        $st->bindValue(':k3', $k, PDO::PARAM_INT);
        $st->bindValue(':k4', $k, PDO::PARAM_INT);
        $st->bindValue(':t', $t, PDO::PARAM_INT);
        $st->bindValue(':t2', $t, PDO::PARAM_INT);
        $st->bindValue(':t3', $t, PDO::PARAM_INT);
        $st->bindValue(':ca', $ca, PDO::PARAM_INT);
        $st->bindValue(':ca2', $ca, PDO::PARAM_INT);
        $st->bindValue(':id', $rid, PDO::PARAM_INT);
        $st->execute();
        return (int) $st->fetchColumn() + 1;
    }

    // Fallback for SQLite < 3.25
    $sql = 'SELECT COUNT(*) FROM scores a
            WHERE (:m IS NULL OR a.monster_id = :m2)
              AND (:c IS NULL OR a.city_id = :c2)
              AND NOT EXISTS (
                SELECT 1 FROM scores b
                WHERE b.name_key = a.name_key
                  AND (:m3 IS NULL OR b.monster_id = :m4)
                  AND (:c3 IS NULL OR b.city_id = :c4)
                  AND (
                    b.score > a.score
                    OR (b.score = a.score AND (
                        b.kos > a.kos
                        OR (b.kos = a.kos AND (
                            b.survival_time > a.survival_time
                            OR (b.survival_time = a.survival_time AND (
                                b.created_at < a.created_at
                                OR (b.created_at = a.created_at AND b.id < a.id)
                            ))
                        ))
                    ))
                  )
              )
              AND (
                a.score > :s
                OR (a.score = :s2 AND a.kos > :k)
                OR (a.score = :s3 AND a.kos = :k2 AND a.survival_time > :t)
                OR (a.score = :s4 AND a.kos = :k3 AND a.survival_time = :t2 AND a.created_at < :ca)
                OR (a.score = :s5 AND a.kos = :k4 AND a.survival_time = :t3 AND a.created_at = :ca2 AND a.id < :id)
              )';
    $st = $pdo->prepare($sql);
    $st->bindValue(':m', $monsterId, $monsterId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $st->bindValue(':m2', $monsterId, $monsterId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $st->bindValue(':m3', $monsterId, $monsterId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $st->bindValue(':m4', $monsterId, $monsterId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $st->bindValue(':c', $cityId, $cityId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $st->bindValue(':c2', $cityId, $cityId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $st->bindValue(':c3', $cityId, $cityId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $st->bindValue(':c4', $cityId, $cityId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $st->bindValue(':s', $s, PDO::PARAM_INT);
    $st->bindValue(':s2', $s, PDO::PARAM_INT);
    $st->bindValue(':s3', $s, PDO::PARAM_INT);
    $st->bindValue(':s4', $s, PDO::PARAM_INT);
    $st->bindValue(':s5', $s, PDO::PARAM_INT);
    $st->bindValue(':k', $k, PDO::PARAM_INT);
    $st->bindValue(':k2', $k, PDO::PARAM_INT);
    $st->bindValue(':k3', $k, PDO::PARAM_INT);
    $st->bindValue(':k4', $k, PDO::PARAM_INT);
    $st->bindValue(':t', $t, PDO::PARAM_INT);
    $st->bindValue(':t2', $t, PDO::PARAM_INT);
    $st->bindValue(':t3', $t, PDO::PARAM_INT);
    $st->bindValue(':ca', $ca, PDO::PARAM_INT);
    $st->bindValue(':ca2', $ca, PDO::PARAM_INT);
    $st->bindValue(':id', $rid, PDO::PARAM_INT);
    $st->execute();
    return (int) $st->fetchColumn() + 1;
}
