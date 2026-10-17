# Security Policy

## Supported versions

Only the latest release receives security fixes.

## Extensions

Extensions run with full Node.js access in a separate process, like any package you install from npm. Waypoint validates what extensions send to the launcher, but it does not sandbox what they can do on your computer. Only install extensions you trust. Reports about ways an extension could affect the launcher beyond its documented API are welcome.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public issues, discussions, or pull requests.**

Report them privately through [GitHub Security Advisories](https://github.com/alexsilver8/waypoint/security/advisories/new). Include as much detail as you can:

- the type of issue and where it lives in the code,
- steps to reproduce, or a proof of concept,
- the impact, and how an attacker might exploit it.

You should get an acknowledgement within a few days. Once the issue is confirmed, a fix will be prepared and released, and you'll be credited in the advisory unless you'd rather stay anonymous.
