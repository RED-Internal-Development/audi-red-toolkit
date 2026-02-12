# RFC-001: Enable Data Sync Toggle

**Status:** Implemented

## Proposal Overview

Add an `enable_data_sync` input to the Toolkit workflow, allowing callers to disable the `data_sync` job. When disabled, `doc_sync` falls back to the caller's direct `destination_folder` and `rename` inputs instead of relying on `data_sync` outputs.

## Background

The toolkit workflow has several toggleable jobs (`enable_doc_sync`, `enable_scanoss`), but `data_sync` always runs unconditionally (`if: always()`). Some consumers only need documentation syncing without the full data collection pipeline (metadata gathering, coverage merging, report pushing to `doc-sync-queue`).

Previously, `doc_sync` depended on `data_sync` outputs (`docs_destination_team_folder`, `app_name`) to build the destination path for the `audred_docsync_action`. If `data_sync` was skipped or failed, these outputs were empty, causing rsync to target the clone root with `--delete` — wiping the `.git/` directory and failing the job.

## Proposal Details

### New Input

```yaml
enable_data_sync:
  description: "Enable data sync step"
  type: boolean
  required: false
  default: true
```

- `required: false` and `default: true` ensure backward compatibility — existing callers are unaffected.

### data_sync Job Condition

Changed from:
```yaml
if: always()
```
To:
```yaml
if: ${{ always() && inputs.enable_data_sync }}
```

### doc_sync Fallback Resolution

A new conditional step `resolve_dest` runs only when `enable_data_sync` is false:

- Reads `destination_folder` and `rename` directly from workflow inputs
- Fails fast if `destination_folder` is empty (prevents the rsync `.git/` deletion bug)

The push step uses `||` fallback expressions:
```yaml
destination_folder: ${{ needs.data_sync.outputs.docs_destination_team_folder || steps.resolve_dest.outputs.docs_destination_team_folder }}
rename: ${{ needs.data_sync.outputs.app_name || steps.resolve_dest.outputs.app_name }}
```

This ensures existing clients using `data_sync` are unaffected, while new callers can opt out.

### Skipping data_sync-dependent steps in doc_sync

Three steps in `doc_sync` download and process the `data-report` artifact produced by `data_sync`. When `data_sync` is disabled, no artifact exists, so these steps are skipped via `if: ${{ inputs.enable_data_sync }}`:

- **Download collection report artifact** — downloads the `data-report` artifact
- **Verify artifact and create fallback if needed** — checks for `report.json`, creates empty fallback
- **Create or update project metrics with report data** — injects coverage/lighthouse metrics into `project_metrics.mdx`

These steps only run when `enable_data_sync` is true (the default), keeping logs clean for callers who opt out.

## References

- Workflow file: `.github/workflows/audired-tookit.yml`
- Doc sync action: `RED-Internal-Development/audred_docsync_action@main`
