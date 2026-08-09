# Sassy Registry 

Web frontend for hosting application registries like npm

## How to run me?

### Local installation

For a local installation, make sure you have the following dependencies installed:
1. Node.js v14 (other versions don't work)
2. npm

### Docker installation

Easiest method is to run the React app through a containerized image.
The `docker-compose.yml` file also mounts the `./src` directory to the container so you can easily edit source files on the host, and enjoy the fast development experience of hot reloading.

To run the containerized version, run the following command:

```sh
docker-compose up --build
```

Note: passing the `--build` will allow it to re-build the container image if anything changed that would require a new Docker image too.

### Reflecting changes to the development environment

If you've made significant changes that require re-building the container image, such as by adding a new dependency, you can run the following command:

```sh
docker-compose up --build
```
