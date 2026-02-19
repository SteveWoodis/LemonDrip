import sqlite3
import psycopg2

# Configuration
SQLITE_PATH = r"c:\lemondrip\backend\lemondrip.db"
PG_CONFIG = {
    "host": "localhost",
    "database": "venview",
    "user": "postgres",
    "password": ""  # leave empty if no password was set
}

def migrate():
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cur = sqlite_conn.cursor()

    pg_conn = psycopg2.connect(**PG_CONFIG)
    pg_conn.autocommit = False
    pg_cur = pg_conn.cursor()

    # Get all tables from SQLite
    sqlite_cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in sqlite_cur.fetchall()]
    print(f"Found tables: {tables}")

    for table in tables:
        print(f"\nMigrating table: {table}")

        # Get column info
        sqlite_cur.execute(f"PRAGMA table_info({table});")
        columns = sqlite_cur.fetchall()

        # Map SQLite types to Postgres types
        type_map = {
            "INTEGER": "BIGINT",
            "REAL": "DOUBLE PRECISION",
            "TEXT": "TEXT",
            "BLOB": "BYTEA",
            "NUMERIC": "NUMERIC",
            "BOOLEAN": "BOOLEAN",
            "DATETIME": "TIMESTAMP",
            "DATE": "DATE",
        }

        col_defs = []
        for col in columns:
            col_name = col[1]
            col_type = col[2].upper().split("(")[0].strip()
            pg_type = type_map.get(col_type, "TEXT")
            is_pk = col[5]
            pk_str = " PRIMARY KEY" if is_pk else ""
            col_defs.append(f'"{col_name}" {pg_type}{pk_str}')

        # Create table in Postgres
        create_sql = f'CREATE TABLE IF NOT EXISTS "{table}" ({", ".join(col_defs)});'
        pg_cur.execute(create_sql)

        # Copy data
        sqlite_cur.execute(f'SELECT * FROM "{table}";')
        rows = sqlite_cur.fetchall()
        if rows:
            col_names = ", ".join(f'"{col[1]}"' for col in columns)
            placeholders = ", ".join(["%s"] * len(columns))
            insert_sql = f'INSERT INTO "{table}" ({col_names}) VALUES ({placeholders})'
            for row in rows:
                pg_cur.execute(insert_sql, tuple(row))

        print(f"  Done — {len(rows)} rows migrated.")

    pg_conn.commit()
    print("\nMigration complete!")
    sqlite_conn.close()
    pg_conn.close()

migrate()