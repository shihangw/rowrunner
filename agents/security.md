# Security and private configuration

Treat deployment metadata as private even when it is not an authentication
credential. Do not put cloud project IDs or numbers, service-account or personal
email addresses, workload identity provider paths, billing identifiers, private
service URLs, tokens, keys, or passwords in tracked files. This includes source,
workflows, tests, examples, documentation, screenshots, and generated artifacts.
Keep these values out of commit messages, PR titles and descriptions, comments,
and command output that will be shared. Public identifiers already central to
the project, such as its npm package name and public demo URL, are exceptions.

- Reference encrypted GitHub Actions secrets by name in workflows. Use an
  appropriate secret store or local environment variables elsewhere. Put local
  configuration files on an ignore list and use clearly fictional placeholders
  in documentation. Never add a real value as a fallback default.
- Before committing and pushing, inspect the staged diff and any new files for
  private identifiers and credentials. Check the proposed commit message and PR
  text as well. Do not print secret values while checking or setting them.
- If a value was pushed, remove it from the current files immediately. Rotate
  actual credentials. For an unmerged branch, rewrite its commits when safe and
  verify the new PR diff. A force-push may leave old commits in GitHub caches or
  PR references; tell the user what remains and use GitHub's sensitive-data
  removal process when full erasure is required.
