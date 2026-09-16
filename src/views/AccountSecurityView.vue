<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { KeyRound, LogIn, ShieldCheck } from 'lucide-vue-next';

import { moduleReadPermissionCodes } from '../data/permissionMatrix';
import { useNavigationStore } from '../stores/navigation';
import { useSessionStore } from '../stores/session';

const router = useRouter();
const navigation = useNavigationStore();
const session = useSessionStore();

const currentPassword = ref('');
const nextPassword = ref('');
const confirmPassword = ref('');
const isSubmitting = ref(false);
const message = ref('');

const accountLabel = computed(() =>
  [session.user.name, session.user.accountCode].filter(Boolean).join(' · '),
);

const currentAccount = computed(() =>
  session.accountOptions.find((account) => account.code === session.user.accountCode),
);

const currentAccountHasPassword = computed(() => currentAccount.value?.passwordSet ?? true);
const currentPasswordPlaceholder = computed(() =>
  currentAccountHasPassword.value ? '输入当前登录密码' : '当前账号尚未设置密码，可直接设置新密码',
);

const firstPasswordBlockedReason = computed(() => {
  if (currentAccountHasPassword.value) return '';
  if (!session.setupMode) return '';
  return session.hasPermission(moduleReadPermissionCodes.system)
    ? ''
    : '首次启用密码登录必须由拥有系统配置维护权限的账号设置，请切换到管理员账号后再操作。';
});
const passwordFieldsDisabled = computed(() => Boolean(firstPasswordBlockedReason.value));
const canSubmit = computed(() =>
  Boolean(
    !passwordFieldsDisabled.value &&
      (currentAccountHasPassword.value ? currentPassword.value : true) &&
      nextPassword.value &&
      confirmPassword.value &&
      !isSubmitting.value,
  ),
);

async function submitPasswordChange() {
  if (!canSubmit.value) return;

  message.value = '';

  if (nextPassword.value !== confirmPassword.value) {
    message.value = '两次输入的新密码不一致';
    return;
  }

  if (nextPassword.value.length < 6) {
    message.value = '新密码至少需要 6 位';
    return;
  }

  try {
    isSubmitting.value = true;
    await session.updateOwnPassword(currentAccountHasPassword.value ? currentPassword.value : '', nextPassword.value, confirmPassword.value);
    navigation.clearMenus();
    await router.replace({ path: '/login', query: { redirect: '/' } });
  } catch (error) {
    message.value = error instanceof Error ? error.message : '密码修改失败';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="page-stack account-security-page">
    <div class="page-heading">
      <div>
        <span>账号</span>
        <h1>账号安全</h1>
      </div>
    </div>

    <div class="account-security-layout">
      <section class="form-section account-security-form">
        <div class="form-section-head">
          <div>
            <span>登录密码</span>
            <h2>修改当前账号密码</h2>
          </div>
          <ShieldCheck :size="18" />
        </div>

        <form class="account-security-fields" @submit.prevent="submitPasswordChange">
          <label class="form-field full-field">
            <span>当前账号</span>
            <input :value="accountLabel" type="text" readonly />
          </label>
          <label class="form-field full-field">
            <span>当前密码</span>
            <input
              v-model="currentPassword"
              type="password"
              autocomplete="current-password"
              :disabled="!currentAccountHasPassword"
              :placeholder="currentPasswordPlaceholder"
            />
          </label>
          <p v-if="!currentAccountHasPassword" class="form-hint full-field">
            当前账号尚未设置登录密码，本次会作为首次密码设置；更新后需要使用新密码重新登录。
          </p>
          <p v-if="firstPasswordBlockedReason" class="form-hint error full-field">
            {{ firstPasswordBlockedReason }}
          </p>
          <label class="form-field">
            <span>新密码</span>
            <input v-model="nextPassword" type="password" autocomplete="new-password" placeholder="至少 6 位" :disabled="passwordFieldsDisabled" />
          </label>
          <label class="form-field">
            <span>确认新密码</span>
            <input v-model="confirmPassword" type="password" autocomplete="new-password" placeholder="再次输入新密码" :disabled="passwordFieldsDisabled" />
          </label>

          <div class="account-security-actions">
            <button class="primary-action" type="submit" :disabled="!canSubmit" :title="firstPasswordBlockedReason || ''">
              <KeyRound :size="15" />
              {{ isSubmitting ? '更新中' : '更新密码' }}
            </button>
            <span v-if="message">{{ message }}</span>
          </div>
        </form>
      </section>

      <aside class="quote-summary-panel account-security-summary">
        <section class="summary-section">
          <h2><LogIn :size="16" /> 重新登录</h2>
          <p>密码更新成功后，系统会清理当前账号的旧会话，并回到登录页。</p>
        </section>
        <section class="summary-section">
          <h2><ShieldCheck :size="16" /> 权限边界</h2>
          <p>这里仅能修改当前登录账号的密码；账号启停、角色和员工关联仍在系统账号管理中维护。</p>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.account-security-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}

.account-security-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.account-security-actions {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.account-security-actions span {
  color: var(--muted);
  font-size: 13px;
}

.account-security-summary p {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

@media (max-width: 900px) {
  .account-security-layout {
    grid-template-columns: 1fr;
  }

  .account-security-fields {
    grid-template-columns: 1fr;
  }
}
</style>
