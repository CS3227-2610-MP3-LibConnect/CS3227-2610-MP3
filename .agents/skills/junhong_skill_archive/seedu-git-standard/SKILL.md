---
name: seedu-git-standard
description: Write Git commit messages and branch names using the SE-EDU Git conventions adopted by this project.
metadata:
  short-description: Follow SE-EDU Git conventions
---

# SE-EDU Git Standard

Use this project skill when proposing commit messages or naming branches. It is
based on the [SE-EDU Git conventions](https://se-education.org/guides/conventions/git.html).

## Commit subjects

- Write a clear, well-formed subject for every commit.
- Aim for 50 characters or fewer; 72 characters is the hard limit.
- Use the imperative mood (for example, `Add README.md`, not `Added README.md`).
- Capitalize the first letter.
- Do not end the subject with a period.
- Add a relevant scope or category prefix when useful, such as `Catalog:` or
  `chore:`.

## Commit bodies

- Include a body for non-trivial commits.
- Separate the subject and body with a blank line.
- Wrap body lines at 72 characters and use blank lines between paragraphs.
- Explain what the commit changes and why. Avoid explaining implementation
  mechanics that are clear from the diff.
- Structure a detailed body in this order: current situation (present tense),
  why it needs to change, what to do (imperative), why that approach was
  chosen, and any other relevant context.
- Use bullets where they make a list easier to read. Avoid repeating details
  already stated in code comments.
- Keep the message focused; if the explanation becomes too long, consider
  whether the changes should be split into smaller commits.

## Branch names

- Use meaningful kebab-case keywords, such as `refactor-ui-tests`.
- For an issue branch, use `<issue-number>-<keywords-from-title>`, such as
  `1234-ui-freeze-error`.
