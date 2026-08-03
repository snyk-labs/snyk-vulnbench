# ☕ Java Coffee Shop

A web application for a coffee shop, built in **Java** with the **Spring Boot** ecosystem. It lets customers browse the catalog of coffees and beers, register an account, place and manage orders, and maintain their profile, while administrators manage the products, customers, and orders behind the scenes.

## Tech stack

- **Java 17**
- **Spring Boot 2.6** — application framework
  - **Spring MVC** — web layer and controllers
  - **Spring Security** — authentication, authorization, and role-based access (PBKDF2 password hashing)
  - **Spring Data JPA** (Hibernate) — persistence
- **Thymeleaf** — server-side HTML templating (with the Spring Security dialect)
- **H2** — in-memory relational database
- **Log4j 2** — logging
- **Bootstrap 3** & **jQuery** — front-end (served via WebJars)
- **Datafaker** — generates realistic sample data at startup
- **Maven** — build and dependency management

## Functionality

### Catalog
- Home page lists all available products (coffees and beers) with name, description, price, and type.
- Full-text **search** of products by name or description.

### Accounts & security
- Self-service **registration** and **login / logout**.
- Two roles with different permissions:
  - **Customer** — shop and manage their own orders.
  - **Admin** — full management of products, customers, and orders.
- Passwords are stored hashed using a PBKDF2 password encoder.

### Profile
- View and update your own profile: name, email, phone, address, and password.
- **Upload a profile picture**.

### Orders
- **Place orders**: add and remove order lines and submit the order.
- View **My Orders** — the order history for the signed-in customer.
- **Export** your orders to **XML** or **YAML**.
- **Import** orders from an **XML** or **YAML** file.

### Administration
- Manage **products**: create, edit, and delete catalog items.
- Manage **persons**: list, add, edit, and delete customer accounts.
- View **all orders** across every customer.

### REST API
A small JSON API is available under `/api/v1`:
- `GET /api/v1/person` — list all persons
- `GET /api/v1/person/{id}` — fetch a single person by id

## Sample data & default accounts

On every startup the application populates the in-memory database with sample products, customers, and orders. Two fixed accounts are always created:

| Role     | Username | Password |
|----------|----------|----------|
| Admin    | `Admin`  | `admin`  |
| Customer | `User`   | `user`   |

Because the database is in-memory (H2), all data is reset each time the application restarts.

## Running the application

### Prerequisites
- Java 17
- Maven 3.x (or use your IDE's bundled Maven)

### Run locally

```bash
mvn spring-boot:run
```

The application starts on **http://localhost:8082**.

### Build and run a JAR

```bash
mvn package
java -jar target/JavaCoffeeShop.jar
```

### Run with Docker

Build the image and start the container with Docker Compose:

```bash
docker compose up --build
```

The container runs the application on port **8082**. Make sure the published port in `docker-compose.yml` maps the host to the container's `8082` port, for example:

```yaml
ports:
  - "8081:8082"   # host:container
```

With the mapping above, the app is reachable at **http://localhost:8081**.

## Useful endpoints

| Path               | Description                             |
|--------------------|-----------------------------------------|
| `/`                | Product catalog and search (home page)  |
| `/login`           | Sign in                                 |
| `/register`        | Create a new account                    |
| `/profile`         | View and edit your profile              |
| `/orders/add`      | Place an order (customers)              |
| `/orders/myorders` | Your order history and import/export    |
| `/orders`          | All orders (admin)                      |
| `/products`        | Product management (admin)              |
| `/persons`         | Customer management (admin)             |
| `/api/v1/person`   | JSON list of persons                    |
| `/h2-console`      | H2 database web console                 |

## Project layout

```
src/main/java/nl/brianvermeer/workshop/coffee
├── api          # REST controllers
├── config       # Security and resource configuration
├── controller   # MVC controllers (web pages)
├── domain       # JPA entities (Person, Product, Order, ...)
├── export       # XML / YAML import & export
├── repository   # Spring Data repositories
└── service      # Business logic
src/main/resources
├── static/css   # Stylesheet
├── templates    # Thymeleaf HTML templates
└── application.properties
```
