# Spec Delta

## Purpose

This capability lets registered members and librarians sign in securely and reach features authorized for their account type. It also establishes the password-hashing behavior shared across account creation and credential changes.

## ADDED Requirements

### Requirement: Role-specific login entry
The system MUST provide a general User Login flow with Member Login and Librarian Login choices, each presenting an email and password form for the selected account type.

#### Scenario: Choose member login
- **WHEN** a visitor selects Member Login
- **THEN** the system presents a form that submits credentials for a member account

#### Scenario: Choose librarian login
- **WHEN** a visitor selects Librarian Login
- **THEN** the system presents a form that submits credentials for a librarian account

### Requirement: Required credential validation
The system MUST require a non-blank email and password before attempting authentication and MUST give a clear prompt for each missing required value.

#### Scenario: Missing credentials
- **WHEN** the user submits the login form with a missing or whitespace-only email or an empty password
- **THEN** the system identifies the required field and does not authenticate the request

### Requirement: Normalize login email only
The system MUST remove leading and trailing whitespace from the email before submission and lookup, and MUST preserve the password exactly as entered.

#### Scenario: Email has surrounding whitespace
- **WHEN** the user submits an email with leading or trailing whitespace
- **THEN** the system submits and looks up the trimmed email while leaving the password unchanged

### Requirement: Authenticate selected active account
The server MUST verify the submitted password against the account hash and authenticate only an active account matching the selected account type.

#### Scenario: Valid active account
- **WHEN** credentials match an active account of the selected type
- **THEN** the server establishes an authenticated session for that account

#### Scenario: Invalid, inactive, or wrong-type account
- **WHEN** the account is missing, inactive, the password is incorrect, or its type differs from the selected login form
- **THEN** the system returns the same generic authentication error without revealing which condition failed

### Requirement: Role-appropriate post-login destination
After successful authentication, the system MUST redirect members to the member dashboard and librarians to the librarian dashboard.

#### Scenario: Member signs in
- **WHEN** a member successfully authenticates
- **THEN** the system redirects the member to the member dashboard

#### Scenario: Librarian signs in
- **WHEN** a librarian successfully authenticates
- **THEN** the system redirects the librarian to the librarian dashboard

### Requirement: Separate service errors from authentication errors
If a network or server failure prevents authentication, the system MUST tell the user that login could not be completed and invite them to try again, without describing the failure as invalid credentials.

#### Scenario: Authentication service unavailable
- **WHEN** the login request cannot be completed due to a network or server failure
- **THEN** the system displays a retryable service error distinct from the generic authentication error

### Requirement: Secure credential transport and session
The system MUST transmit credentials only over HTTPS in deployed environments and MUST protect authenticated sessions from client-side script access and cleartext transport.

#### Scenario: Deployed login uses HTTPS
- **WHEN** a user accesses a deployed login page or submits credentials
- **THEN** the page and credential request use HTTPS

#### Scenario: Authenticated session is issued
- **WHEN** authentication succeeds
- **THEN** the system issues a session credential that is unavailable to client-side scripts and is sent only over HTTPS

### Requirement: Argon2id password hashing across the project
The system MUST use a vetted Argon2id library with a unique random salt for each password and MUST store the encoded hash needed for verification; submitted plaintext passwords MUST NOT be stored or logged.

#### Scenario: Password is created or changed
- **WHEN** the system creates or changes any project account password
- **THEN** it stores an Argon2id encoded hash with a unique salt and does not store or log the plaintext password

#### Scenario: Login verifies password
- **WHEN** the server checks a login password
- **THEN** it verifies the exact submitted password using the stored Argon2id hash

### Requirement: Login works without JavaScript
The login choices and credential forms MUST support standard browser navigation and form submission when JavaScript is disabled, with all security and credential checks performed by the server.

#### Scenario: Login with JavaScript disabled
- **WHEN** a visitor selects an account type and submits valid credentials with JavaScript disabled
- **THEN** the server processes the standard form submission and completes the same authentication flow
