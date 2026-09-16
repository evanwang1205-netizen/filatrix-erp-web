<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  name?: string;
  code?: string;
  model?: string;
  spec?: string;
  imageUrl?: string;
  imageLabel?: string;
  imageTone?: string;
  compact?: boolean;
  textOnly?: boolean;
}>(), {
  name: '',
  code: '',
  model: '',
  spec: '',
  imageUrl: '',
  imageLabel: '',
  imageTone: '#eeeeee',
  compact: false,
  textOnly: false,
});

function clean(value: unknown) {
  return String(value ?? '').trim();
}

const title = computed(() => clean(props.name) || clean(props.code) || '物料');

const meta = computed(() => {
  const parts = [props.code, props.model, props.spec].map(clean).filter(Boolean);
  return parts.filter((part, index) => {
    const normalized = part.replace(/\s+/g, '').toLowerCase();
    return !parts.slice(0, index).some((current) => {
      const compared = current.replace(/\s+/g, '').toLowerCase();
      return compared === normalized;
    });
  }).join(' · ');
});

const badge = computed(() => {
  const explicit = clean(props.imageLabel);
  if (explicit) return explicit.slice(0, 4).toUpperCase();
  const code = clean(props.code);
  if (code) {
    const segments = code.split(/[-_\s]+/).filter(Boolean);
    return (segments[segments.length - 1] || code).slice(0, 4).toUpperCase();
  }
  return clean(props.name).replace(/\s+/g, '').slice(0, 2).toUpperCase() || 'MAT';
});

const accessibleTitle = computed(() => [title.value, meta.value].filter(Boolean).join(' · '));
</script>

<template>
  <span class="material-identity" :class="{ 'is-compact': compact, 'is-text-only': textOnly }" :title="accessibleTitle">
    <span v-if="!textOnly" class="material-identity__thumb" :style="{ backgroundColor: imageTone }" aria-hidden="true">
      <img v-if="imageUrl" :src="imageUrl" alt="" />
      <span v-else>{{ badge }}</span>
    </span>
    <span class="material-identity__text">
      <strong>{{ title }}</strong>
      <small v-if="meta">{{ meta }}</small>
      <slot name="supplement" />
    </span>
  </span>
</template>

<style scoped>
.material-identity {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  gap: 12px;
  text-align: left;
  vertical-align: middle;
}

.material-identity__thumb {
  display: inline-flex;
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid rgba(43, 51, 47, 0.08);
  border-radius: 10px;
  color: #4d5551;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.material-identity__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.material-identity__text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  line-height: 1.25;
}

.material-identity__text strong,
.material-identity__text small {
  display: block;
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.material-identity__text strong {
  color: #202421;
  font-size: 14px;
  font-weight: 700;
}

.material-identity__text small {
  color: #727a76;
  font-size: 12px;
}

.material-identity.is-compact {
  gap: 10px;
}

.material-identity.is-text-only {
  display: grid;
  gap: 0;
}

.material-identity.is-text-only .material-identity__text {
  gap: 3px;
}

.material-identity.is-text-only .material-identity__text strong {
  font-size: 13px;
}

.material-identity.is-text-only .material-identity__text small {
  font-size: 11px;
}

.material-identity.is-compact .material-identity__thumb {
  flex-basis: 40px;
  width: 40px;
  height: 40px;
  border-radius: 9px;
  font-size: 10px;
}
</style>
