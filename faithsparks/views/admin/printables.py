"""Admin-only card-set builder. Every action checks the admin allowlist."""

from __future__ import annotations

import json
import os
import re

from flask import Response, abort, flash, redirect, render_template, request, session, url_for

from faithsparks.services.printable_pdf import LOGO_PATH, render_product_pdf
from faithsparks.services.printable_products import (
    ADVENT_SLUG,
    ProductError,
    clone_for_translation,
    delete_product,
    edition_choices,
    empty_product,
    export_errors,
    fill_empty_full_verses,
    get_product,
    listing_markdown,
    list_products,
    load_advent_draft,
    notice_for,
    parse_import,
    parse_listing_import,
    product_from_form,
    save_product,
)
from faithsparks.services.storage import upload_storage_bytes

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def admin_identity() -> str:
    email = (session.get("user_email") or "").strip().lower()
    allowed = {item.strip().lower() for item in os.getenv("ADMIN_EMAILS", "").split(",") if item.strip()}
    if not email or email not in allowed:
        abort(403)
    return email


def _pdf_response(product: dict, *, download: bool):
    try:
        data, warnings = render_product_pdf(product)
    except ValueError as exc:
        abort(400, description=str(exc))
    filename = f"{product['id']}-{product['translation']}.pdf"
    disposition = "attachment" if download else "inline"
    headers = {
        "Content-Disposition": f"{disposition}; filename=\"{filename}\"",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
    }
    if warnings:
        headers["X-Printable-Overflow"] = ", ".join(warnings)[:500]
    return Response(data, mimetype="application/pdf", headers=headers)


def admin_printables():
    admin_identity()
    return render_template(
        "admin_printables.html",
        products=list_products(),
        editions=edition_choices(),
        logo_ready=LOGO_PATH.is_file(),
    )


def admin_printables_new():
    email = admin_identity()
    if request.method == "POST":
        action = request.form.get("action") or "create"
        try:
            if action == "load_advent":
                product = load_advent_draft()
            else:
                slug = (request.form.get("slug") or "").strip().lower()
                product = empty_product(
                    slug=slug,
                    title=request.form.get("title") or "",
                    translation=request.form.get("translation") or "",
                    product_kind=request.form.get("product_kind") or "advent",
                )
            save_product(product, email)
        except ProductError as exc:
            flash(" ".join(exc.errors), "error")
            return redirect(url_for("admin_printables"))
        flash("Draft saved. It is not public.", "success")
        return redirect(url_for("admin_printable_edit", slug=product["id"]))
    return redirect(url_for("admin_printables"))


def admin_printable_edit(slug: str):
    email = admin_identity()
    if not _SLUG_RE.fullmatch(slug or ""):
        abort(404)
    product = get_product(slug)
    if request.method == "POST":
        action = request.form.get("action") or "save"
        try:
            product = _apply_action(product, slug, action, email)
        except ProductError as exc:
            flash(" ".join(exc.errors), "error")
            return redirect(url_for("admin_printable_edit", slug=slug))
        if action == "delete":
            return redirect(url_for("admin_printables"))
        return redirect(url_for("admin_printable_edit", slug=product["id"]))
    if not product:
        abort(404)
    code, notice = notice_for(product["translation"])
    return render_template(
        "admin_printable_edit.html",
        product=product,
        editions=edition_choices(),
        notice_code=code,
        notice_text=notice,
        export_problems=export_errors(product),
        advent_slug=ADVENT_SLUG,
    )


def _apply_action(product: dict | None, slug: str, action: str, email: str) -> dict:
    if action == "delete":
        if not delete_product(slug):
            raise ProductError(["That draft was not found."])
        flash("Draft deleted.", "success")
        return product or empty_product(slug=slug, title="Deleted", translation="web")
    if product is None and action != "import_content":
        raise ProductError(["That draft was not found."])
    if action == "add_card":
        product["cards"].append({
            "kind": "scripture",
            "number": str(len(product["cards"]) + 1),
            "label": "",
            "title": "",
            "reference": "",
            "scripture_text": "",
            "partial": False,
            "partial_note": "",
            "younger_prompt": "",
            "older_prompt": "",
            "prayer": "",
            "activity": "",
            "scripture_source": "",
        })
        product = save_product(product, email)
        flash("Empty Scripture card added. Paste the exact wording before export.", "success")
        return product
    if action in {"delete_card", "move_card"}:
        product = product_from_form(request.form, product)
    if action == "delete_card":
        try:
            index = int(request.form.get("card_index") or "-1")
        except ValueError:
            index = -1
        if index < 0 or index >= len(product["cards"]):
            raise ProductError(["Choose a card to remove."])
        product["cards"].pop(index)
        return save_product(product, email)
    if action == "move_card":
        try:
            index = int(request.form.get("card_index") or "-1")
        except ValueError:
            index = -1
        direction = -1 if request.form.get("direction") == "up" else 1
        target = index + direction
        if index < 0 or target < 0 or index >= len(product["cards"]) or target >= len(product["cards"]):
            raise ProductError(["That card cannot move."])
        cards = product["cards"]
        cards[index], cards[target] = cards[target], cards[index]
        return save_product(product, email)
    if action == "import_content":
        upload = request.files.get("import_file")
        if not upload:
            raise ProductError(["Choose a JSON or Advent markdown file."])
        imported = parse_import(upload.read(400_000), upload.filename or "", slug=slug)
        return save_product(imported, email)
    if action == "import_listing":
        upload = request.files.get("import_file")
        if not upload:
            raise ProductError(["Choose the listing markdown file."])
        product["listing"] = parse_listing_import(upload.read(400_000))
        saved = save_product(product, email)
        flash("Listing copy saved as an unpublished draft.", "success")
        return saved
    if action == "fill_scripture":
        product, notes = fill_empty_full_verses(product)
        saved = save_product(product, email)
        flash(" ".join(notes), "info")
        return saved
    if action == "create_edition":
        translation = request.form.get("edition_translation") or ""
        edition_slug = (request.form.get("edition_slug") or "").strip().lower() or f"{slug}-{translation.strip().lower()}"
        if get_product(edition_slug):
            raise ProductError(["That edition slug already exists."])
        cloned = clone_for_translation(product, translation, edition_slug)
        saved = save_product(cloned, email)
        flash(
            f"{saved['translation'].upper()} edition created with Scripture text cleared. "
            "Import or paste that translation before exporting.",
            "success",
        )
        return saved
    if action == "reload_advent":
        if slug != ADVENT_SLUG or request.form.get("confirm") != "replace":
            raise ProductError(["Reloading the packaged Advent draft needs confirmation."])
        return save_product(load_advent_draft(), email)
    if action == "store_pdf":
        try:
            data, warnings = render_product_pdf(product)
        except ValueError as exc:
            raise ProductError([str(exc)]) from exc
        path = f"printable-products/{slug}/{product['translation']}.pdf"
        if not upload_storage_bytes(data, path, "application/pdf"):
            raise ProductError(["Private storage is not configured. Download the PDF instead. Nothing was written to local disk."])
        product["pdf_storage_path"] = path
        saved = save_product(product, email)
        flash(f"Stored a private PDF at {path}.", "success")
        if warnings:
            flash("Some cards may still be tight: " + ", ".join(warnings), "warning")
        return saved
    if action == "save":
        if product is None:
            raise ProductError(["That draft was not found."])
        updated = product_from_form(request.form, product)
        saved = save_product(updated, email)
        flash("Draft saved.", "success")
        return saved
    raise ProductError(["Unknown action."])


def admin_printable_preview(slug: str):
    admin_identity()
    product = get_product(slug)
    if not product:
        abort(404)
    return _pdf_response(product, download=False)


def admin_printable_export_pdf(slug: str):
    admin_identity()
    product = get_product(slug)
    if not product:
        abort(404)
    return _pdf_response(product, download=True)


def admin_printable_export_json(slug: str):
    admin_identity()
    product = get_product(slug)
    if not product:
        abort(404)
    body = json.dumps(product, indent=2, ensure_ascii=False)
    return Response(
        body,
        mimetype="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{slug}.json"',
            "Cache-Control": "private, no-store",
            "X-Robots-Tag": "noindex, nofollow",
        },
    )


def admin_printable_listing(slug: str):
    admin_identity()
    product = get_product(slug)
    if not product:
        abort(404)
    return Response(
        listing_markdown(product),
        mimetype="text/markdown",
        headers={
            "Content-Disposition": f'attachment; filename="{slug}-listing.md"',
            "Cache-Control": "private, no-store",
            "X-Robots-Tag": "noindex, nofollow",
        },
    )
