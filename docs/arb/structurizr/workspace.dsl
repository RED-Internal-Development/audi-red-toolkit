workspace "AudiRED Toolkit Orchestrator" "Reusable GitHub Actions workflow orchestrating doc sync, test collection, and metadata aggregation across team repos." {

    !identifiers hierarchical

    model {

        # ──────────────────────────────────────────
        # People / Actors
        # ──────────────────────────────────────────
        teamDev = person "Team Developer" "Developer whose CI/CD pipeline invokes the toolkit to sync docs and metrics." {
            tags "Audi User"
        }
        platformTeam = person "Audi RED Platform Team" "Maintains toolkit workflows and app-type configuration profiles." {
            tags "Authors"
        }

        # ──────────────────────────────────────────
        # External Systems - Callers
        # ──────────────────────────────────────────
        teamRepos = softwareSystem "Team GitHub Repositories" "Team repositories that invoke the toolkit via workflow_call or daily schedule." {
            tags "Internal System"
        }

        # ──────────────────────────────────────────
        # External Systems - Destinations
        # ──────────────────────────────────────────
        redDocsPortal = softwareSystem "Audi RED Documentation Portal" "Central hub for standards, security intelligence, dependency tracking, and tech radar within Audi RED." {
            tags "Internal System"
        }

        vwgoaConfluenceCloud = element "VWGOA Cloud Confluence" "Confluence Space" "VWGOA enterprise Confluence wiki." {
            tags "External System"
        }

        msiConfluence = element "Audi MSI Confluence" "Confluence Space" "Audi MSI Confluence space." {
            tags "External System"
        }

        # ──────────────────────────────────────────
        # Main Software System
        # ──────────────────────────────────────────
        toolkitOrchestrator = softwareSystem "AudiRED Toolkit Orchestrator" "Reusable GitHub Actions workflow orchestrating doc sync, test collection, and metadata publishing for team repos." {
            tags "Added Entity"

            # ── Containers ──────────────────────────

            workflowOrchestrator = container "Workflow Orchestrator" "Core workflow (audired-tookit.yml). Validates inputs, detects project type, and sequences downstream jobs." "GitHub Actions Reusable Workflow" {
                tags "Added Entity"

                inputValidation = component "Input Validation Job" "Validates required inputs and secrets before downstream jobs run." "GitHub Actions Job" {
                    tags "Added Entity", "Component"
                }
                projectDetection = component "Project Type Detection Job" "Resolves app_type from input or auto-detects from Cypress/Jest config." "GitHub Actions Job" {
                    tags "Added Entity", "Component"
                }
                appTypeProfiles = component "App Type Profiles Config" "Maps app_type to destination path, branch, and MSI parent page ID." "YAML Configuration" {
                    tags "Added Entity", "Component"
                }
                observabilitySummary = component "Observability Summary Job" "Captures and emits final status of all workflow jobs." "GitHub Actions Job" {
                    tags "Added Entity", "Component"
                }
            }

            docSyncAction = container "Doc Sync Action" "Validates docs, generates Structurizr diagrams, embeds CI metrics, and pushes to RED Docs Portal." "audred_docsync_action / audired_structurizr_action" {
                tags "Added Entity"

                mdxValidator = component "MDX Validator" "Validates MDX and Mermaid content before sync." "Node.js / CLI" {
                    tags "Added Entity", "Component"
                }
                structurizrRenderer = component "Structurizr Renderer" "Generates workspace.json and PNG diagrams from workspace.dsl files." "audired_structurizr_action" {
                    tags "Added Entity", "Component"
                }
                metricsInjector = component "Metrics Injector" "Injects CI coverage scores into project_metrics.mdx." "Bash / jq" {
                    tags "Added Entity", "Component"
                }
                docPublisher = component "Doc Publisher" "Copies validated docs to the profile-resolved branch in RED Docs Portal." "audred_docsync_action" {
                    tags "Added Entity", "Component"
                }
            }

            testCollectionKit = container "Test Collection Kit" "Collects Cypress and Jest coverage artifacts and stages them as a data-report." "audi-red-collection-kit" {
                tags "Added Entity"

                cypressSync = component "Cypress Sync Job" "Downloads Cypress coverage artifacts for aggregation." "GitHub Actions Job" {
                    tags "Added Entity", "Component"
                }
                jestSync = component "Jest Sync Job" "Downloads Jest coverage summary for aggregation." "GitHub Actions Job" {
                    tags "Added Entity", "Component"
                }
                collectionKitAction = component "Collection Kit Action" "Aggregates Jest, Cypress, and Lighthouse results into a unified data-report." "audi-red-collection-kit" {
                    tags "Added Entity", "Component"
                }
            }

            metadataKit = container "Metadata Kit" "Collects repository metadata and aggregates it into report.json." "audi-red-app-metadata-kit" {
                tags "Added Entity"

                metadataCollector = component "Metadata Collector" "Reads package.json and resolves team ownership and lifecycle stage." "audi-red-app-metadata-kit" {
                    tags "Added Entity", "Component"
                }
                reportPublisher = component "Report Publisher" "Commits the aggregated report.json entry to RED Docs Portal." "Git / GitHub Actions" {
                    tags "Added Entity", "Component"
                }
            }

            confluenceSyncAction = container "Confluence Sync Action" "Syncs documentation pages to VWGOA Confluence Cloud." "audired_confluence_cloud_action" {
                tags "Added Entity"
            }

            msiAction = container "MSI Sync Action" "Syncs documentation pages to Audi MSI Confluence." "audired_msi_action" {
                tags "Added Entity"
            }
        }

        # ──────────────────────────────────────────
        # Relationships - Context level
        # ──────────────────────────────────────────

        # Invocation
        teamDev -> teamRepos "[Git push / merge] \n Commits code, documentation, and test results to main branch \n[GitHub]"
        teamRepos -> toolkitOrchestrator "[workflow_call / schedule] \n Invokes toolkit as a reusable workflow after CI/CD completion or on daily cron (9pm ET) \n[GitHub Actions]"

        # Platform management
        platformTeam -> toolkitOrchestrator "[Manages] \n Maintains workflow logic, reusable actions, and app-type profiles \n[GitHub]"

        # Destinations
        toolkitOrchestrator -> redDocsPortal "[Git commit] \n Pushes synced documentation, architecture diagrams, test metrics, and dependency reports \n[DOC_SYNC_KEY / Git]"
        toolkitOrchestrator -> vwgoaConfluenceCloud "[HTTPS REST] \n Syncs documentation pages to VWGOA Confluence \n[Confluence API Token]"
        toolkitOrchestrator -> msiConfluence "[HTTPS REST] \n Syncs documentation pages to MSI Confluence \n[MSI API Token]"

        # ──────────────────────────────────────────
        # Relationships - Container level
        # ──────────────────────────────────────────

        # Orchestration sequence
        teamRepos -> toolkitOrchestrator.workflowOrchestrator "[Invokes] \n Calls the main workflow orchestrator reusable workflow \n[GitHub Actions]"
        toolkitOrchestrator.workflowOrchestrator -> toolkitOrchestrator.docSyncAction "[Triggers] \n After input validation and project type detection \n[GitHub Actions]"
        toolkitOrchestrator.workflowOrchestrator -> toolkitOrchestrator.testCollectionKit "[Triggers] \n Parallel to doc sync \n[GitHub Actions]"
        toolkitOrchestrator.workflowOrchestrator -> toolkitOrchestrator.metadataKit "[Triggers] \n After test collection completes \n[GitHub Actions]"
        toolkitOrchestrator.workflowOrchestrator -> toolkitOrchestrator.confluenceSyncAction "[Triggers] \n After doc sync if enabled \n[GitHub Actions]"
        toolkitOrchestrator.workflowOrchestrator -> toolkitOrchestrator.msiAction "[Triggers] \n After doc sync if enabled \n[GitHub Actions]"

        # Team repo provides artifacts to collection kit
        teamRepos -> toolkitOrchestrator.testCollectionKit "[workflow_run artifact] \n CI/CD run produces Jest, Cypress, Lighthouse coverage artifacts \n[GitHub Actions Artifact]"

        # Doc sync destination
        toolkitOrchestrator.docSyncAction -> redDocsPortal "[Git commit] \n Pushes docs folder to profile-resolved branch (docs-sync/feature-apps, docs-sync/backend-services, etc.) \n[DOC_SYNC_KEY / rsync + Git]"

        # Metadata kit destination
        toolkitOrchestrator.metadataKit -> redDocsPortal "[Git commit] \n Updates report.json entry for this repository \n[DOC_SYNC_KEY / Git]"

        # Confluence sync destination
        toolkitOrchestrator.confluenceSyncAction -> vwgoaConfluenceCloud "[HTTPS REST] \n Creates or updates documentation pages \n[Confluence API Token]"
        toolkitOrchestrator.msiAction -> msiConfluence "[HTTPS REST] \n Creates or updates MSI documentation pages \n[MSI API Token]"

        # ──────────────────────────────────────────
        # Relationships - Component level
        # ──────────────────────────────────────────

        # Orchestrator internal flow
        toolkitOrchestrator.workflowOrchestrator.inputValidation -> toolkitOrchestrator.workflowOrchestrator.projectDetection "[Triggers] \n Passes validated inputs downstream \n[GitHub Actions]"
        toolkitOrchestrator.workflowOrchestrator.projectDetection -> toolkitOrchestrator.workflowOrchestrator.appTypeProfiles "[Reads] \n Resolves destination path, branch, and MSI parent page ID \n[File System]"

        # Doc sync internal flow
        toolkitOrchestrator.docSyncAction.mdxValidator -> toolkitOrchestrator.docSyncAction.structurizrRenderer "[Sequences] \n MDX validation must pass before diagram generation \n[GitHub Actions]"
        toolkitOrchestrator.docSyncAction.structurizrRenderer -> toolkitOrchestrator.docSyncAction.metricsInjector "[Sequences] \n Diagrams generated before metrics injection \n[GitHub Actions]"
        toolkitOrchestrator.docSyncAction.metricsInjector -> toolkitOrchestrator.docSyncAction.docPublisher "[Sequences] \n Enriched docs folder pushed to portal \n[GitHub Actions]"
        toolkitOrchestrator.docSyncAction.docPublisher -> redDocsPortal "[Git commit] \n Pushes validated and enriched docs to portal repository \n[DOC_SYNC_KEY / rsync + Git]"

        # Test collection internal flow
        toolkitOrchestrator.testCollectionKit.cypressSync -> toolkitOrchestrator.testCollectionKit.collectionKitAction "[Provides] \n Cypress coverage artifacts \n[GitHub Actions Artifact]"
        toolkitOrchestrator.testCollectionKit.jestSync -> toolkitOrchestrator.testCollectionKit.collectionKitAction "[Provides] \n Jest coverage artifacts \n[GitHub Actions Artifact]"

        # Metadata kit internal flow
        toolkitOrchestrator.metadataKit.metadataCollector -> toolkitOrchestrator.metadataKit.reportPublisher "[Produces] \n Aggregated repository entry for report.json \n[In-memory]"
        toolkitOrchestrator.metadataKit.reportPublisher -> redDocsPortal "[Git commit] \n Commits report.json update \n[DOC_SYNC_KEY / Git]"

        # ──────────────────────────────────────────
        # Deployment Environment
        # ──────────────────────────────────────────
        production = deploymentEnvironment "Production" {

            deploymentNode "Audi RED Github Instance" {
                softwareSystemInstance redDocsPortal 
                
                deploymentNode "AudiRED Github Actions Runners" {
                    containerInstance toolkitOrchestrator.workflowOrchestrator
                    containerInstance toolkitOrchestrator.docSyncAction
                    containerInstance toolkitOrchestrator.testCollectionKit
                    containerInstance toolkitOrchestrator.metadataKit
                    containerInstance toolkitOrchestrator.confluenceSyncAction
                    containerInstance toolkitOrchestrator.msiAction
                }   
            }
            deploymentNode "OneAudi AG Github Instance" {
                softwareSystemInstance teamRepos
            }

            deploymentNode "MyAudi App Github Instance" {
                softwareSystemInstance teamRepos
            }
        }
    }

    views {

        # ──────────────────────────────────────────
        # C4 Level 1 - System Context
        # ──────────────────────────────────────────
        systemContext toolkitOrchestrator "Context_Diagram" {
            include *
            include teamRepos teamDev platformTeam
            include redDocsPortal
            include vwgoaConfluenceCloud msiConfluence
            autoLayout lr
            title "C4 Level 1 - System Context: AudiRED Toolkit Orchestrator"
            description "Team repositories invoke the AudiRED Toolkit after CI/CD completion. The toolkit orchestrates documentation sync, test data collection, and metadata aggregation - publishing outputs to the RED Documentation Portal and Confluence Cloud."
        }

        # ──────────────────────────────────────────
        # C4 Level 2 - Container Diagram
        # ──────────────────────────────────────────
        container toolkitOrchestrator "Container_Diagram" {
            include *
            include teamRepos
            autoLayout tb
            title "C4 Level 2 - Container Diagram: AudiRED Toolkit Orchestrator"
            description "Shows the reusable GitHub Actions containers that make up the toolkit: the workflow orchestrator, doc sync, test collection, metadata kit, and Confluence sync."
        }

        # ──────────────────────────────────────────
        # Deployment Diagram
        # ──────────────────────────────────────────
        deployment * production "Deployment_Diagram" {
            include *
            autoLayout lr
            title "Deployment Diagram: AudiRED Toolkit Orchestrator (Production)"
            description "Shows where each toolkit component runs - all jobs execute on GitHub Actions runners within the RED-Internal-Development organisation."
        }

        # ──────────────────────────────────────────
        # Styles
        # ──────────────────────────────────────────
        styles {
            element "Added Entity" {
                background #AED581
            }
            element "Updated Entity" {
                background #FBC02D
            }
            element "Internal System" {
                background #00bcd4
                color #ffffff
            }
            element "External System" {
                background #646464
                color #ffffff
            }
            element "Audi User" {
                shape Person
                background #646464
                color #ffffff
            }
            element "Authors" {
                shape Person
                background #104786
                color #ffffff
            }
            element "Person" {
                shape Person
            }
            element "Component" {
                shape Component
            }
        }

        themes https://static.structurizr.com/themes/google-cloud-v1.5/icons.json
    }

    configuration {
        scope none
    }
}
