<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { KeyRound, LogIn } from 'lucide-vue-next';

import { useNavigationStore } from '../stores/navigation';
import { useSessionStore } from '../stores/session';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const navigation = useNavigationStore();

const username = ref('');
const password = ref('');
const isSubmitting = ref(false);
const message = ref(session.accountLoadError || '');
const redirectPath = computed(() => {
  const redirect = route.query.redirect;
  return typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/';
});

async function submitLogin() {
  if (isSubmitting.value) return;

  message.value = '';
  isSubmitting.value = true;

  try {
    await session.login(username.value.trim(), password.value);
    await navigation.loadMenus(true);
    await router.replace(redirectPath.value);
  } catch (error) {
    message.value = error instanceof Error ? error.message : '登录失败';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-panel">
      <div class="login-brand">
        <img src="/filatrix-logo-strip-white.png" alt="filatrix" />
      </div>

      <div class="login-copy">
        <span><KeyRound :size="16" /> 账号登录</span>
        <h1>filatrix ERP</h1>
      </div>

      <form class="login-form" @submit.prevent="submitLogin">
        <label>
          <span>账号</span>
          <input v-model="username" type="text" autocomplete="username" placeholder="用户名 / 账号编码" autofocus />
        </label>
        <label>
          <span>密码</span>
          <input v-model="password" type="password" autocomplete="current-password" placeholder="登录密码" />
        </label>
        <button class="primary-action" type="submit" :disabled="isSubmitting">
          <LogIn :size="16" />
          {{ isSubmitting ? '登录中' : '登录' }}
        </button>
        <p v-if="message" class="login-message">{{ message }}</p>
      </form>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 24px;
  background: #e8ebe5;
}

.login-panel {
  display: grid;
  width: min(420px, 100%);
  gap: 18px;
  padding: 22px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  color: #f8faf7;
  background: rgba(15, 18, 16, 0.84);
  box-shadow: 0 18px 54px rgba(15, 18, 16, 0.3);
  backdrop-filter: blur(10px);
}

.login-brand {
  display: flex;
  align-items: center;
}

.login-brand img {
  width: 148px;
  height: auto;
}

.login-copy {
  display: grid;
  gap: 8px;
}

.login-copy span {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 6px;
  color: #d9e1d7;
  font-size: 13px;
}

.login-copy h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0;
}

.login-form {
  display: grid;
  gap: 12px;
}

.login-form label {
  display: grid;
  gap: 6px;
  color: #d9e1d7;
  font-size: 13px;
}

.login-form input {
  width: 100%;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #f8faf7;
  background: rgba(255, 255, 255, 0.08);
  outline: none;
}

.login-form input:focus {
  border-color: rgba(214, 228, 204, 0.82);
  box-shadow: 0 0 0 3px rgba(214, 228, 204, 0.14);
}

.login-form input::placeholder {
  color: rgba(248, 250, 247, 0.54);
}

.login-form .primary-action {
  width: 100%;
  justify-content: center;
  min-height: 42px;
}

.login-message {
  margin: 0;
  color: #ffd8d2;
  font-size: 13px;
  line-height: 1.45;
}

@media (max-width: 560px) {
  .login-page {
    padding: 16px;
  }

  .login-panel {
    padding: 18px;
  }
}
</style>
