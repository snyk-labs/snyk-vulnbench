export const database = {
    authorName: "Scott Sassy",
    aboutAuthor: "Scott Sassy is a software engineer at Sassyreg Company. He is responsible for the development and maintenance of the Sassyreg application.",
    twitterLink: "https://twitter.com/scottsassy1",
    testimonial: {
        cite: "friend",
        text: "great app developer"
    },
    packageManifest: {
        "name": "cli-prompts",
        "version": "1.1.2",
        "description": "surf the cli with great prompts and tui",
        "bin": {
          "clip": "./bin/clip.js",
        },
        "scripts": {
          "lint": "standard && eslint . --ignore-path .gitignore && yarn run lint:lockfile",
          "lint:lockfile": "lockfile-lint --path yarn.lock --type yarn --validate-https --allowed-hosts npm yarn",
          "test": "jest",
          "start": "node index.js"
        },
        "author": {
          "name": "Scott Sassy",
          "email": "author@sassyreg.com"
        },
        "license": "Apache-2.0"
    },
    authorScreenshotURL: 'https://miro.medium.com/max/5138/0*bd98yHi9ydSq_xU.png',
    authorScreenshotDescription: "Scott Sassy screenshot"
};
