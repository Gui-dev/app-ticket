# Skill: Professional Git Commits (English)

## Standard Format
Always follow the Conventional Commits specification:
`<type>(<optional scope>): <description>`

### Allowed Types:
- **feat**: A new feature for the user.
- **fix**: A bug fix.
- **docs**: Documentation only changes.
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc).
- **refactor**: A code change that neither fixes a bug nor adds a feature.
- **perf**: A code change that improves performance.
- **test**: Adding missing tests or correcting existing tests.
- **chore**: Changes to the build process or auxiliary tools and libraries.

## Hard Rules
1. **Language**: Use **English** exclusively.
2. **Imperative Mood**: Use "add", "fix", "change" instead of "added", "fixes", "changed".
3. **No Capitalization**: Start the description with a lowercase letter.
4. **No Period**: Do not end the commit message with a dot.
5. **Scope**: Mention the module or component in parentheses if applicable (e.g., `feat(auth):`, `fix(ui):`).
6. **Atomic Commits**: If multiple unrelated changes are detected, suggest separate commits for each.

## Extended Format (Optional)
For more complex changes, you can add a body and footer:

```
<type>(<scope>): <description>

<body explanation>

<footer>
```

### Body
- Use blank line between subject and body
- Explain **what** and **why**, not **how**
- Wrap at 72 characters

### Footer
- **Breaking changes**: `BREAKING CHANGE: description`
- **Issue references**: `Closes #123`, `Fixes #456`, `Refs #789`

### Issue References
When your commit addresses an issue or PR, reference it in the footer:

| Keyword | When to use |
|---------|-------------|
| `Closes #123` | Commit resolves the issue completely |
| `Fixes #123` | Commit fixes a bug in the issue |
| `Refs #123` | Commit references the issue but doesn't close it |
| `Related to #123` | Commit is related to the issue |

### Example with breaking change
```
feat(auth): change login API response format

BREAKING CHANGE: the login endpoint now returns an object with
token and user instead of just token.

Closes #123
```

## Instruction for OpenCode
"When a task is completed, analyze the staged changes and propose a commit message following these rules. Ensure the type and scope accurately reflect the diff."
