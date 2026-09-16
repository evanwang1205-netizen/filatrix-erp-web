<script setup lang="ts">
import { computed } from 'vue';
import { ChevronLeft, ChevronRight, PanelRightClose, X } from 'lucide-vue-next';

import { useReferencePanelStore } from '../stores/referencePanel';

const referencePanel = useReferencePanelStore();

const referenceSrc = computed(() => {
  if (!referencePanel.path || typeof window === 'undefined') return '';
  const url = new URL(referencePanel.path, window.location.origin);
  url.searchParams.set('referencePanel', '1');
  return url.toString();
});
</script>

<template>
  <aside
    v-if="referencePanel.open"
    id="reference-side-panel"
    class="reference-side-panel"
    :class="{ collapsed: referencePanel.collapsed }"
    aria-label="右侧参考页"
  >
    <template v-if="referencePanel.collapsed">
      <button
        class="reference-panel-rail-button"
        type="button"
        title="展开参考页"
        aria-label="展开参考页"
        @click="referencePanel.toggleCollapsed"
      >
        <ChevronLeft :size="16" />
      </button>
      <span class="reference-panel-rail-title">{{ referencePanel.title || '参考页' }}</span>
      <button
        class="reference-panel-rail-button"
        type="button"
        title="关闭参考页"
        aria-label="关闭参考页"
        @click="referencePanel.closeReference"
      >
        <X :size="15" />
      </button>
    </template>

    <template v-else>
      <header class="reference-side-head">
        <div>
          <strong>{{ referencePanel.title || '参考页' }}</strong>
          <span v-if="referencePanel.subtitle">{{ referencePanel.subtitle }}</span>
        </div>
        <div class="reference-side-actions">
          <button type="button" title="收起参考页" aria-label="收起参考页" @click="referencePanel.toggleCollapsed">
            <PanelRightClose :size="15" />
          </button>
          <button type="button" title="关闭参考页" aria-label="关闭参考页" @click="referencePanel.closeReference">
            <X :size="15" />
          </button>
        </div>
      </header>
      <iframe
        v-if="referenceSrc"
        class="reference-side-frame"
        :src="referenceSrc"
        :title="referencePanel.title || '参考页'"
      ></iframe>
      <div v-else class="reference-side-empty">
        <ChevronRight :size="18" />
        <span>暂无参考页</span>
      </div>
    </template>
  </aside>
</template>
