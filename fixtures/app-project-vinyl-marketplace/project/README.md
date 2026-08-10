# Vinyl Marketplace

A Spring Boot application for browsing, searching, and managing a catalog of vinyl records. It ships with a static HTML/JavaScript frontend, a REST API, and an in-memory H2 database that is seeded with a collection of classic albums on startup.

## Features

- Browse the full vinyl catalog, sorted by artist.
- Search records by title, artist, or genre.
- View the details of an individual record.
- Add and edit records, including an optional cover image upload.
- Export the catalog (or a selection) to a file and import it back.

## Tech stack

- **Java 21**
- **Spring Boot 3.5.x** — Web (MVC), Data JPA
- **H2** — in-memory database (recreated on every startup)
- **Maven** — build and dependency management
- Static frontend (`index.html`, `vinyl-detail.html`, `vinyl-form.html`) served from `src/main/resources/static`

## Prerequisites

You can run the application either with Docker (no Java required) or natively.

- **With Docker:** [Docker](https://docs.docker.com/get-docker/) and Docker Compose (bundled with Docker Desktop).
- **Natively:** **JDK 21** or newer (`java -version` should report 21+) and **Maven 3.9+** (`mvn -version`).

## Running with Docker

This is the easiest way to get started — no local Java or Maven installation
needed. From the project root:

```bash
docker compose up --build
```

This builds the image (compiling the app inside a Maven container) and starts it
on **port 8094**. Stop it with `Ctrl+C`, or run detached and tear down with:

```bash
docker compose up --build -d   # run in the background
docker compose down            # stop and remove the container
```

To build and run the image directly with the Docker CLI instead of Compose:

```bash
docker build -t vinyl-marketplace .
docker run --rm -p 8094:8094 -v "$(pwd)/uploads:/app/uploads" vinyl-marketplace
```

## Running the application natively

From the project root:

```bash
mvn spring-boot:run
```

Or build a jar and run it:

```bash
mvn clean package
java -jar target/vinyl-marketplace-0.0.1-SNAPSHOT.jar
```

The application starts on **port 8094**. Once it is up, open:

- **Web UI:** http://localhost:8094/
- **H2 console:** http://localhost:8094/h2-console
  - JDBC URL: `jdbc:h2:mem:vinyldb`
  - Username: `sa`
  - Password: *(empty)*

The database is created fresh on each run (`ddl-auto=create-drop`) and seeded
with sample albums by `DataLoader`. Uploaded cover images are written to an
`./uploads` directory and served under `/uploads/**`.

## REST API

Base path: `/api/vinyls`

| Method | Path                 | Description                                              |
|--------|----------------------|----------------------------------------------------------|
| GET    | `/api/vinyls`        | List all records, or filter with `?search=<term>`        |
| GET    | `/api/vinyls/{id}`   | Get a single record by id                                |
| POST   | `/api/vinyls`        | Create a record (multipart form; optional `image` field) |
| PUT    | `/api/vinyls/{id}`   | Update an existing record (multipart form)               |
| GET    | `/api/vinyls/export` | Export all records, or `?ids=1,2,3` for a selection       |
| POST   | `/api/vinyls/import` | Import records from a previously exported file           |

### Create / update fields

`title`, `artist`, `genre`, `releaseYear`, `price`, `condition`, and an optional
`image` file are submitted as multipart form parameters.

### Example requests

List and search:

```bash
curl http://localhost:8094/api/vinyls
curl "http://localhost:8094/api/vinyls?search=beatles"
```

Create a record:

```bash
curl -X POST http://localhost:8094/api/vinyls \
  -F "title=Kind of Blue" \
  -F "artist=Miles Davis" \
  -F "genre=Jazz" \
  -F "releaseYear=1959" \
  -F "price=49.99" \
  -F "condition=Mint" \
  -F "image=@cover.jpg"
```

## Configuration

Settings live in `src/main/resources/application.properties`. Notable values:

- `server.port=8094`
- `spring.servlet.multipart.max-file-size=10MB`
- H2 in-memory datasource and console configuration

## Project structure

```
src/main/java/io/acme/engineering/vynil_marketplace/
├── VinylMarketplaceApplication.java   # Spring Boot entry point
├── config/
│   ├── DataLoader.java                # Seeds sample data on startup
│   └── WebConfig.java                 # Serves uploaded files from /uploads
├── controller/
│   ├── VinylApiController.java        # REST API (/api/vinyls)
│   └── VinylController.java           # Redirects / to the web UI
├── domain/Vinyl.java                  # JPA entity
├── repository/VinylRepository.java    # Spring Data JPA repository
└── service/VinylService.java          # Business logic
src/main/resources/static/            # HTML/CSS/JS frontend and album images
```

## Running the tests

```bash
mvn test
```
