# Spec Delta

## Purpose

This capability allows visitors to create member and librarian accounts with validated details, unique identities, secure passwords, and the correct role-specific activation state.

## ADDED Requirements

### Requirement: Role-specific registration fields
The system MUST let a visitor select Member or Librarian registration and present the required fields for that account type.

#### Scenario: Member registration fields
- **WHEN** a visitor selects Member registration
- **THEN** the form requires name, email, password, and password confirmation

#### Scenario: Librarian registration fields
- **WHEN** a visitor selects Librarian registration
- **THEN** the form requires name, email, password, password confirmation, and employee ID

### Requirement: Validate registration fields on the server
The server MUST validate all required fields and formats before creating an account, and MUST return clear field-level errors for invalid submissions.

#### Scenario: Required values are missing
- **WHEN** a submitted name, email, password, confirmation, or required librarian employee ID is empty or whitespace-only
- **THEN** the server rejects registration and identifies the missing field

#### Scenario: Email format is invalid
- **WHEN** the trimmed email does not contain a non-empty part before and after `@`
- **THEN** the server rejects registration and identifies the email field

#### Scenario: Password policy fails
- **WHEN** the password is shorter than eight characters or contains whitespace
- **THEN** the server rejects registration and identifies the password requirement

#### Scenario: Password confirmation differs
- **WHEN** the password and confirmation do not match exactly
- **THEN** the server rejects registration and identifies the confirmation field

### Requirement: Normalize identity fields consistently
The system MUST trim surrounding whitespace from emails and librarian employee IDs and compare their canonical forms case-insensitively. The system MUST NOT alter passwords.

#### Scenario: Email differs only by case
- **WHEN** an email is submitted with different letter casing from an existing account
- **THEN** the system treats it as the same email identity

#### Scenario: Employee ID differs only by case
- **WHEN** a librarian employee ID is submitted with different letter casing from an existing librarian account
- **THEN** the system treats it as the same employee identity

#### Scenario: Password is preserved
- **WHEN** the visitor submits a password
- **THEN** the system validates and hashes the exact password without trimming or otherwise changing it

### Requirement: Enforce unique account identities atomically
The system MUST ensure email addresses are unique across member and librarian accounts and librarian employee IDs are unique among all librarian accounts, including inactive accounts. Concurrent registrations MUST NOT create duplicate identities.

#### Scenario: Email is already registered
- **WHEN** the canonical email belongs to any existing account
- **THEN** the system rejects registration with an email-specific error and creates no account

#### Scenario: Librarian employee ID is already registered
- **WHEN** a librarian submits a canonical employee ID already used by a librarian account
- **THEN** the system rejects registration with an employee-ID-specific error and creates no account

#### Scenario: Concurrent requests claim the same identity
- **WHEN** two registration requests concurrently submit the same canonical email or librarian employee ID
- **THEN** at most one account is created and the other request receives the relevant duplicate-field error

### Requirement: Create accounts with server-generated identifiers and defaults
The system MUST generate account IDs and registration time on the server and MUST assign account type and status from the selected registration type.

#### Scenario: Member account is created
- **WHEN** a valid member registration succeeds
- **THEN** the system creates a unique user ID, unique member ID, registration time, account type MEMBER, and account status ACTIVE

#### Scenario: Librarian account is created
- **WHEN** a valid librarian registration succeeds
- **THEN** the system creates a unique user ID, registration time, account type LIBRARIAN, account status INACTIVE, and manager privilege disabled

### Requirement: Store passwords securely
The system MUST hash every registered password with the project Argon2id password service using a unique random salt and MUST NOT store or log submitted plaintext passwords.

#### Scenario: Registration stores password hash
- **WHEN** a valid registration succeeds
- **THEN** the account stores an Argon2id encoded hash sufficient for later verification and stores no plaintext password

### Requirement: Protect registration transport
The system MUST transmit registration credentials only over HTTPS in deployed environments.

#### Scenario: Registration in a deployed environment
- **WHEN** a visitor loads or submits the registration form in a deployed environment
- **THEN** the page and credential submission use HTTPS

### Requirement: Support registration without JavaScript
The registration form MUST work through standard browser form submission when JavaScript is disabled, and the server MUST perform all required validation and account creation checks.

#### Scenario: Register with JavaScript disabled
- **WHEN** a visitor submits a valid registration using a browser with JavaScript disabled
- **THEN** the server processes the form and creates the appropriate account

### Requirement: Report registration outcomes
The system MUST show a success message and redirect to User Login after account creation, and MUST distinguish service failures from validation or duplicate-field errors.

#### Scenario: Registration succeeds
- **WHEN** the account is created successfully
- **THEN** the system displays success feedback and redirects the visitor to User Login

#### Scenario: Registration service fails
- **WHEN** a network or server error prevents registration
- **THEN** the system says registration could not be completed and invites the visitor to try again without presenting the failure as invalid input or a duplicate
