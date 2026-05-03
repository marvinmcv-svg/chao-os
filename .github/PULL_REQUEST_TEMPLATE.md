---
name: Pull Request
description: Submit changes to CHAO OS
title: "type(scope): "
labels: []
body:
  - type: markdown
    attributes:
      value: |
        ## Pull Request Summary

        ## Type

        Select the type that best describes this change:
        - [ ] **feat** — New feature
        - [ ] **fix** — Bug fix
        - [ ] **docs** — Documentation only
        - [ ] **style** — Code style (formatting, missing semicolons, etc.)
        - [ ] **refactor** — Code change that neither fixes a bug nor adds a feature
        - [ ] **perf** — Performance improvement
        - [ ] **test** — Adding or correcting tests
        - [ ] **build** — Changes to build process or dependencies
        - [ ] **ci** — Changes to CI/CD pipeline
        - [ ] **chore** — Other changes (maintenance, tooling, etc.)

  - type: textarea
    id: summary
    attributes:
      label: Summary
      description: Brief description of what this PR does (1-3 sentences).
      placeholder: This PR adds...
    validations:
      required: true

  - type: textarea
    id: motivation
    attributes:
      label: Motivation & Context
      description: Why is this change needed? What problem does it solve?
      placeholder: |
        - Addresses issue: #
        - Motivation for this change...
    validations:
      required: false

  - type: textarea
    id: testing
    attributes:
      label: Testing
      description: How was this tested? Any manual testing performed?
      placeholder: |
        - Unit tests added/corrected
        - Manual testing steps...
    validations:
      required: false

  - type: textarea
    id: checklist
    attributes:
      label: Checklist
      description: Ensure all items are completed before merging.
      placeholder: |
        - [ ] Code follows project conventions
        - [ ] Documentation updated (if applicable)
        - [ ] No new console warnings or errors
        - [ ] Secrets confirmed (DATABASE_URL, NEXTAUTH_SECRET, ANTHROPIC_API_KEY) — values set as GitHub secrets if changed
    validations:
      required: false
