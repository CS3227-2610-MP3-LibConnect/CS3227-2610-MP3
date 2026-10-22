#### Dashboard
The dashboard page which contains the following components

- a navbar at the top of the page, shared with all other pages, details specified [here](#navbar)
- a greeting to the user (Welcome back, <name>)
- a catalog of all available book titles available
- a search bar that allows a member to search up specific book titles.
  - an advanced search feature that allows members to look up by other parameters of the book, such as all books within a range of publish year, author, category, isbn, etc.
  - the basic search and advanced search should support searching by substring, other than ISBN and year, which needs to be exact.
- the cards for each book title should be clickable, and each card will redirect to a book information page, details specified [here](#book-information-page)
  - each card should have the following details
    - a photo of the book
    - the book title
    - the category of the book
    - the synopsis of the book, cut short with `...` to limit the size of the card



#### Navbar
The navbar is an element shared across all pages. it contains clickable buttons that navigate to the various pages. this navbar will be built up as more pages are added.

The navbar will have the following appearance
|LibConnect         <page 1> <page 2> ... <page n> <profile icon>|

clicking on `LibConnect` will redirect the member to the dashboard.

the button for the page that the member is currently on will be highlighted and disabled on the navbar

the profile icon redirects the user to the profile page, which will be implemented later, and is out of scope for the dashboard.

#### Book information page
The book information page should contain the following details

- `isbn`: ISBN that identifies the book title
- `title`: title of the book
- `author`: author or authors
- `publicationYear`: year of publication
- `publisher`: publisher’s name
- `category`: genre or category
- `synopsis`: short description of the book

additionally, there should also be information of the availability of each copy of the book. the information required would be:

- shelf location
- status