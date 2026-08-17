<script setup>
import axios from 'axios'
import { onMounted, ref } from 'vue'
import TechItems from './components/TechItems.vue'
import { restoreWorkspacePreferences } from './workspacePreferences'
import logoSVG from '@/assets/logo.svg';

const query = new URLSearchParams(window.location.search)
const workspacePreferences = restoreWorkspacePreferences()
const welcomeMessage = ref(query.get('welcome') || 'Explore the technology catalog.')
const logoURL = ref(query.get('logo_url') || '')
const logoPreview = ref('')
const logoPreviewError = ref('')
const renderBrandingMarkup = workspacePreferences.branding.renderMarkup === 'true'

async function previewLogo() {
  logoPreviewError.value = ''
  logoPreview.value = ''
  try {
    const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/branding/preview`, {
      params: { logo_url: logoURL.value },
      responseType: 'text'
    })
    if (renderBrandingMarkup) {
      welcomeMessage.value = response.data
    } else {
      logoPreview.value = response.data
    }
  } catch (error) {
    logoPreviewError.value = error.response?.data || error.message
  }
}

onMounted(() => {
  if (renderBrandingMarkup && logoURL.value) {
    previewLogo()
  }
})
</script>

<template>
  <main id="app">
    <h2 class="title">app-project-goxygen-generated</h2>
    <div class="logo">
      <img :src="logoSVG" height="150" alt="logo" />
    </div>
    <section class="welcome-banner" aria-live="polite">
      <div v-html="welcomeMessage"></div>
    </section>
    <section class="branding">
      <h3>Workspace branding</h3>
      <label>
        Remote logo URL
        <input v-model="logoURL" type="url" placeholder="https://cdn.example.test/logo.svg" />
      </label>
      <button type="button" @click="previewLogo">Preview logo</button>
      <pre v-if="logoPreview && !renderBrandingMarkup">{{ logoPreview }}</pre>
      <p v-if="logoPreviewError" class="error">{{ logoPreviewError }}</p>
    </section>
    <div>
      This project is generated with
      <b>
        <a href="https://github.com/shpota/goxygen">goxygen</a>
      </b>.
      <p />The following list of technologies comes from
      a REST API call to the Go-based back end. Find
      and change the corresponding code in
      <code>webapp/src/components/TechItems.vue</code>
      and <code>server/web/app.go</code>.
      <TechItems />
    </div>
    <small class="layout-hint">
      Current workspace layout: {{ workspacePreferences.dashboard.layout || 'comfortable' }}
    </small>
  </main>
</template>

<style>
body {
  margin-top: 5%;
  padding-right: 5%;
  padding-left: 5%;
  font-size: larger;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

@media screen and (min-width: 800px) {
  body {
    padding-right: 15%;
    padding-left: 15%;
  }
}

@media screen and (min-width: 1600px) {
  body {
    padding-right: 30%;
    padding-left: 30%;
  }
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, "Courier New",
    monospace;
  background-color: #b3e6ff;
}

.title {
  text-align: center;
}

.logo {
  text-align: center;
}

.welcome-banner {
  margin: 1rem auto;
  padding: 0.75rem 1rem;
  border: 1px solid #b3e6ff;
  border-radius: 0.5rem;
  background: #f4fbff;
}

.layout-hint {
  display: block;
  margin-top: 2rem;
  color: #5f6b76;
}

.branding {
  margin: 1rem 0;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
}

.branding label {
  display: grid;
  gap: 0.25rem;
}

.branding input {
  max-width: 32rem;
  padding: 0.4rem;
}

.branding button {
  margin-top: 0.5rem;
}

.error {
  color: #a11;
}
</style>
