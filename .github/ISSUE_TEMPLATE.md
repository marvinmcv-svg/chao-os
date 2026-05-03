---
name: Bug Report
description: Report a bug to help us improve CHAO OS
title: "bug(scope): "
labels: [bug]
body:
  - type: markdown
    attributes:
      value: |
        ## Bug Report

        Thanks for taking the time to report a bug. Please fill out the sections below and replace any placeholder text.

  - type: textarea
    id: description
    attributes:
      label: Description
      description: A clear and concise description of the bug.
      placeholder: Describe what happened...
    validations:
      required: true

  - type: textarea
    id: steps
    attributes:
      label: Steps to Reproduce
      description: How to reproduce this bug.
      placeholder: |
        1. Go to '...'
        2. Click on '...'
        3. See error
    validations:
      required: true

  - type: textarea
    id: expected
    attributes:
      label: Expected Behavior
      description: What you expected to happen.
      placeholder: Expected behavior...
    validations:
      required: true

  - type: textarea
    id: actual
    attributes:
      label: Actual Behavior
      description: What actually happened.
      placeholder: Actual behavior...
    validations:
      required: true

  - type: input
    id: environment
    attributes:
      label: Environment
      description: OS, Node version, browser, etc.
      placeholder: e.g., Windows 11, Node 20, Chrome 120
    validations:
      required: false
