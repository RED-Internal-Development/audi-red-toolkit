# Profile Type Onboarding Guide

This guide describes how to add a new `app_type` profile and make sure all downstream sync workflows keep working (`docs-sync`, `msi-sync`, `daily-merge`, and optional `vwgoa-sync`).

## 1. Add profile in toolkit config

Update `audi-red-toolkit/config/app-type-profiles.yml` with a new top-level key.

Required fields:

- `red_docs.base_path`
- `red_docs.branch`

Optional fields:

- `msi.parent_page_id`
- `vwgoa.parent_page_id`

Example:

```yaml
audired_service:
  red_docs:
    base_path: "docs/audired_services/{app}"
    branch: "docs-sync/audired-services"
  msi:
    parent_page_id: "1882393087"
```

## 2. Update toolkit workflow resolution

File: `audi-red-toolkit/.github/workflows/audired-tookit.yml`

Update all app-type resolution points:

- `inputs.app_type` description
- `resolve_profile_key` / `map_legacy_project_type` mapping
- `validate_app_type` accepted values
- all Ruby `alias_map` blocks used for profile lookup

Rule:

- Use one canonical key format only (for this profile: `audired_service`) and avoid adding dual-format aliases.

## 3. Update RED documentation stream merge workflow

File: `audi-red-documentation/.github/workflows/daily_merge.yml`

Add the new profile stream end-to-end:

- resolve `<type>_branch`, `<type>_base`, `<type>_root`, `<type>_dir_name`
- checkout and copy from the stream branch into `/tmp`
- overwrite docs in `doc-sync-queue`
- include new root in special-path exclusion conditions
- copy new stream into `/tmp/docs/...` and then into `main`

## 4. Update MSI publish workflow

File: `audi-red-documentation/.github/workflows/msi_sync.yml`

Add the new MSI stream inputs:

- resolve `<type>_root` and `<type>_parent` from profile
- include new root in markdown/image/mermaid preprocessing loops
- add a `Publish <Type> to MSI Confluence` step using `audired_msi_action`

## 5. VWGOA workflow (only if needed)

File: `audi-red-documentation/.github/workflows/vwgoa_sync.yml`

Only update this if the new profile should deploy to VWGOA:

- add `vwgoa.parent_page_id` in profile
- include the profile in the VWGOA selection logic if required by business rules

If VWGOA is not intended, do not add `vwgoa` config for that profile.

## 6. Update user-facing docs

Minimum docs updates:

- `audi-red-toolkit/docs/toolkit-setup-guide.md` supported app types table
- `audi-red-toolkit/README.md` capability summary

## 7. Validation checklist

Run these checks before merge:

1. Trigger toolkit workflow in a sample repo with `app_type` set to the new profile key.
2. Verify docs are pushed to the profile-defined `red_docs.branch` and `red_docs.base_path`.
3. Verify `daily_merge.yml` copies this stream into `doc-sync-queue` and `main`.
4. Verify `msi_sync.yml` publishes docs under the configured MSI parent.
5. Verify no regression for existing profiles (`feature_app`, `backend_service`, `mobile_app`, `special_app`).
