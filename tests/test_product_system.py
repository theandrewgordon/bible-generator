from pathlib import Path

from app import _is_latency_critical_path, app
from faithsparks.products import PRIMARY_NAVIGATION, PRODUCTS


ROOT = Path(__file__).resolve().parents[1]


def test_product_registry_has_task_first_navigation_and_formal_labs():
    assert [item["label"] for item in PRIMARY_NAVIGATION] == [
        "Prepare", "Worship", "Play", "My Library", "Labs"
    ]
    labs = [product for product in PRODUCTS if product["area"] == "labs"]
    assert {product["maturity"] for product in labs} <= {"beta", "experiment", "sandbox"}
    assert {product["id"] for product in labs} == {"weekflow", "coloring-studio"}
    assert all(product["path"] != "/speeddie" for product in PRODUCTS)


def test_task_landing_pages_and_parent_brand_render():
    app.config.update(TESTING=True)
    with app.test_client() as client:
        for path, expected in (
            ("/prepare", b"Gathering Builder"),
            ("/play", b"Family Game Night"),
            ("/labs", b"maturity guide"),
            ("/families", b"Families &amp; Homeschool"),
            ("/churches", b"Churches &amp; Small Groups"),
        ):
            response = client.get(path)
            assert response.status_code == 200
            assert expected in response.data
            assert b"Faith Sparks" in response.data
            assert response.headers["Server-Timing"].startswith("app;dur=")
        assert b"Bring Scripture into the week you already have" in client.get("/families").data
        assert b"Prepare the gathering. Lead it from the room" in client.get("/churches").data


def test_labs_are_noindex_and_sitemap_only_lists_public_core_routes():
    app.config.update(TESTING=True)
    with app.test_client() as client:
        labs = client.get("/labs")
        assert b'content="noindex,nofollow"' in labs.data

        sitemap = client.get("/sitemap.xml")
        assert sitemap.status_code == 200
        assert sitemap.mimetype == "application/xml"
        assert b"/prepare</loc>" in sitemap.data
        assert b"/play</loc>" in sitemap.data
        assert b"/families</loc>" in sitemap.data
        assert b"/churches</loc>" in sitemap.data
        assert b"/labs" not in sitemap.data
        assert b"/worship/live" not in sitemap.data


def test_speed_die_is_direct_url_only_and_not_faith_sparks_branded():
    app.config.update(TESTING=True)
    with app.test_client() as client:
        labs = client.get("/labs")
        speed_die = client.get("/speeddie")
    assert b"Speed Die" not in labs.data
    assert speed_die.status_code == 200
    assert b"Speed Die Helper" in speed_die.data
    assert b"Faith Sparks" not in speed_die.data
    assert speed_die.headers["X-Robots-Tag"] == "noindex, nofollow"


def test_homepage_uses_single_optimized_hero_and_task_language():
    app.config.update(TESTING=True)
    with app.test_client() as client:
        response = client.get("/")
    assert response.status_code == 200
    assert b"Bring Scripture into your homeschool day" in response.data
    assert b"Start with your family" in response.data
    assert b"Leading a church or small group?" in response.data
    assert b"faith-sparks-home-hero.jpg" in response.data
    assert b"CopyworkStock/Copywork" not in response.data
    assert b"data-hero-images" not in response.data
    assert (ROOT / "static" / "faith-sparks-home-hero.jpg").stat().st_size < 300_000


def test_start_here_routes_by_audience_before_task():
    app.config.update(TESTING=True)
    with app.test_client() as client:
        response = client.get("/start-here")
    assert response.status_code == 200
    assert b"Start with your setting" in response.data
    assert b"Families &amp; Homeschool" in response.data
    assert b"Churches &amp; Small Groups" in response.data
    assert b'href="/families"' in response.data
    assert b'href="/churches"' in response.data


def test_production_server_keeps_live_capacity_available():
    dockerfile = (ROOT / "Dockerfile").read_text()
    procfile = (ROOT / "Procfile").read_text()
    dockerignore = (ROOT / ".dockerignore").read_text().splitlines()
    for command in (dockerfile, procfile):
        assert "--worker-class gthread" in command
        assert "--workers ${WEB_CONCURRENCY:-2}" in command
        assert "--threads ${GUNICORN_THREADS:-4}" in command
    assert ".git" in dockerignore
    assert "raw_images" in dockerignore
    assert "node_modules" in dockerignore


def test_live_polling_and_room_actions_use_the_latency_critical_lane():
    assert _is_latency_critical_path("/worship/live/state/session")
    assert _is_latency_critical_path("/api/family-bible-bee/rooms/ABCD")
    assert _is_latency_critical_path("/api/family-game-night/rooms/ABCD/heartbeat")
    assert not _is_latency_critical_path("/lesson-pack")
    assert not _is_latency_critical_path("/family-game-night")
