This file describes the member feature for creating loans.

#### Borrow Page

The borrow page is only accessible to logged in members.
the page allows members to borrow copies of books by providing the copyid.
members are allowed to borrow up to 10 books at once.
    for instance, if a member already has active loans for 3 books, they are only allowed to borrow 7 more books

##### Required functionality

members should be required to provide the copyid of the book to borrow it.
if the copy does not have the status of `AVAILABLE`, members are not allowed to borrow it.
members cannot be allowed to have more than 10 active loans at once. if they attempt to borrow more books after hitting the limit, they should be disallowed to borrow a book.
upon confirming the loan, members will be shown a popup listing all the books they are borrowing to confirm that it is correct, only upon confirmation will the loan be processed.
the status of borrowed books will be changed from `AVAILABLE` to `ON_LOAN`
a loan record is created for every book borrowed, and it is attributed to the member



##### out of scope
you are not requried to implement the page to allow members to view all active and past loans.
you are not requried to implement the page to allow members to return loans.
