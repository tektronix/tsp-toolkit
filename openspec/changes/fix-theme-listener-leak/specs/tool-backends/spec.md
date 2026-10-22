# Spec Delta

## MODIFIED Requirements

### Requirement: Theme changes

When the active color theme changes while a tool's panel is open and its backend process
exists, the extension SHALL send `{"refresh":true,"reason":"theme-change"}` to that
backend exactly once, however many times the panel has been opened and closed before.
While the tool has no open panel, a theme change SHALL send nothing to that backend.

#### Scenario: Theme switched

- **WHEN** the script generation panel is open and the user switches to a light theme
- **THEN** the script generation backend receives the theme refresh signal

#### Scenario: Panel reopened several times

- **WHEN** the user has closed and reopened the TriggerFlow panel three times and then
  switches theme
- **THEN** the TriggerFlow backend receives the theme refresh signal once

#### Scenario: Panel closed

- **WHEN** the script generation panel has been closed and the user switches theme
- **THEN** the script generation backend receives no theme refresh signal
