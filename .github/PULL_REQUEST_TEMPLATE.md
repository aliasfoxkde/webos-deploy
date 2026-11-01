name: Pull request
about: Propose a change to the WebOS shell or packaging
body:
  - type: textarea
    id: summary
    attributes:
      label: Summary
      description: What changed and why (one paragraph).
    validations:
      required: true
  - type: textarea
    id: verification
    attributes:
      label: How verified
      description: |
        Gates run (`cd webos && npm run ci`)? E2E sweep? Manual check?
        Include the coverage numbers if you touched a ratchet floor.
        Fixes ship with a regression test naming the failure prevented.
    validations:
      required: true
  - type: checkboxes
    id: checklist
    attributes:
      label: Checklist
      options:
        - label: `npm run ci` green (lint zero-warnings, coverage ratchets, build)
          required: true
        - label: No ratchet floor lowered; no test deleted just to pass
          required: true
        - label: Docs updated (ARCHITECTURE Module index, docs references)
        - label: No fetched artifacts (apps/, zips/, r2-blobs/) committed
          required: true
