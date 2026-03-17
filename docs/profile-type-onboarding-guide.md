---
sidebar_position: 1
id: audired-toolkit-profile-configuration
title: AudiRED Toolkit
sidebar_label: Toolkit App profile configuration
discipline: development
lifecycle_stage: build
artifact_type: reference
owner: engineering-enablement
roles:
  - platform-engineer
  - architect
  - frontend-engineer
  - backend-engineer
  - quality-engineer
  - app-engineer
  - content-author
  - product-manager
systems:
  - toolkit-service
  - red-toolkit
last_reviewed: "2026-03-17"
tags:
  - "discipline:development"
  - "stage:build"
  - "artifact:reference"
  - "owner:engineering-enablement"
  - "collection:development"
  - "section:tools"
  - "topic:toolkit-service"
  - "topic:red-toolkit"
  - "role:platform-engineer"
  - "role:backend-engineer"
  - "system:toolkit-service"
  - "system:red-toolkit"
---

# App Profile Configuration Guide

This guide explains what app profile configuration is, how it drives toolkit behavior, and how to add a new `app_type` safely.

## What app profile configuration is

App profile configuration is the central routing map used by AudiRED Toolkit.

Source of truth:

- `audi-red-toolkit/config/app-type-profiles.yml`

Each top-level key is an app profile type (for example `feature_app`, `backend_service`, `mobile_app`, `audired_service`, `special_app`).
Each profile can define destination rules for multiple targets.

## How profiles drive runtime behavior

### `red_docs` section

- `red_docs.base_path`: destination path template in RED docs portal (`{app}` is replaced with repository name)
- `red_docs.branch`: stream branch used by doc sync and daily merge

Used by:

- `audi-red-toolkit/.github/workflows/audired-tookit.yml` (doc sync target resolution)
- `audi-red-documentation/.github/workflows/daily_merge.yml` (stream-to-main merge)

### `msi` section

- `msi.parent_page_id`: parent page where MSI Confluence pages are published

Used by:

- `audi-red-documentation/.github/workflows/msi_sync.yml`
- `audired_msi_action`

### `vwgoa` section (optional)

- `vwgoa.parent_page_id`: parent page for VWGOA publish target

Used by:

- `audi-red-toolkit/.github/workflows/audired-tookit.yml` (deployment config generation)
- `audi-red-documentation/.github/workflows/vwgoa_sync.yml`

## How to add a new app profile type

### 1. Add the new profile in toolkit config

Update `audi-red-toolkit/config/app-type-profiles.yml` with a new top-level key.

Required:

- `red_docs.base_path`
- `red_docs.branch`

Optional:

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

### 2. Register the app type in toolkit workflow resolution

File: `audi-red-toolkit/.github/workflows/audired-tookit.yml`

Update app type resolution points:

- `inputs.app_type` description
- `resolve_profile_key` / `map_legacy_project_type` mapping
- `validate_app_type` accepted values
- all Ruby `alias_map` blocks used for profile lookup

Rule: use one canonical key format only.

### 3. Update RED docs stream merge workflow

File: `audi-red-documentation/.github/workflows/daily_merge.yml`

Add the new profile stream end-to-end:

- resolve `<type>_branch`, `<type>_base`, `<type>_root`, `<type>_dir_name`
- checkout and copy from the stream branch into `/tmp`
- overwrite docs in `doc-sync-queue`
- include new root in special-path exclusion conditions
- copy new stream into `/tmp/docs/...` and then into `main`

### 4. Update MSI publish workflow (if MSI is enabled for the profile)

File: `audi-red-documentation/.github/workflows/msi_sync.yml`

Add the new MSI stream inputs:

- resolve `<type>_root` and `<type>_parent` from profile
- include new root in markdown/image/mermaid preprocessing loops
- add a `Publish <Type> to MSI Confluence` step using `audired_msi_action`

### 5. Update VWGOA workflow (only if VWGOA is enabled)

File: `audi-red-documentation/.github/workflows/vwgoa_sync.yml`

Only update this if the new profile should deploy to VWGOA:

- add `vwgoa.parent_page_id` in profile
- include the profile in the VWGOA selection logic if required by business rules

If VWGOA is not intended, do not add `vwgoa` config for that profile.

### 6. Update user-facing documentation

Minimum docs updates:

- `audi-red-toolkit/docs/toolkit-setup-guide.md` supported app types table
- `audi-red-toolkit/README.md` capability summary

### 7. Validate end-to-end

Run these checks before merge:

1. Trigger toolkit workflow in a sample repo with `app_type` set to the new profile key.
2. Verify docs are pushed to the profile-defined `red_docs.branch` and `red_docs.base_path`.
3. Verify `daily_merge.yml` copies this stream into `doc-sync-queue` and `main`.
4. Verify `msi_sync.yml` publishes docs under the configured MSI parent.
5. Verify no regression for existing profiles (`feature_app`, `backend_service`, `mobile_app`, `special_app`).
