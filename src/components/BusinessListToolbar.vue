<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { ArrowDownUp, Download, Search, SlidersHorizontal } from 'lucide-vue-next';

import SalesFilterPopover from './SalesFilterPopover.vue';

type ToolbarMenuKey = 'sort' | 'filter' | 'export';
type SortMode = 'newest' | 'oldest' | 'amountDesc' | 'status';
type FilterFieldKey = 'status' | 'party' | 'owner';
type FilterOption = string | { value: string; label: string };

type FilterField = {
  key: FilterFieldKey;
  label: string;
  options: FilterOption[];
  control?: 'select' | 'search';
};

const props = withDefaults(defineProps<{
  search: string;
  searchPlaceholder: string;
  openMenu: ToolbarMenuKey | null;
  sortMode: SortMode;
  sortAmountLabel: string;
  sortDateLabel?: string;
  newestSortLabel?: string;
  oldestSortLabel?: string;
  showSort?: boolean;
  showAmountSort?: boolean;
  statusSortLabel?: string;
  showStatusSort: boolean;
  activeFilterCount: number;
  filterFields: FilterField[];
  filterDateLabel: string;
  filterStatus: string;
  filterParty: string;
  filterOwner: string;
  filterDateStart: string;
  filterDateEnd: string;
}>(), {
  showSort: true,
});

const emit = defineEmits<{
  'update:search': [value: string];
  'update:filterStatus': [value: string];
  'update:filterParty': [value: string];
  'update:filterOwner': [value: string];
  'update:filterDateStart': [value: string];
  'update:filterDateEnd': [value: string];
  toggleMenu: [menu: ToolbarMenuKey];
  sort: [mode: SortMode];
  exportRows: [];
  clearFilters: [];
  applyFilters: [];
}>();

const sortTrigger = ref<HTMLButtonElement | null>(null);
const filterTrigger = ref<HTMLButtonElement | null>(null);
const exportTrigger = ref<HTMLButtonElement | null>(null);

function restoreMenuFocus(menu: ToolbarMenuKey) {
  void nextTick(() => {
    const trigger = menu === 'sort' ? sortTrigger.value : menu === 'filter' ? filterTrigger.value : exportTrigger.value;
    trigger?.focus();
  });
}

function updateSearch(event: Event) {
  emit('update:search', event.target instanceof HTMLInputElement ? event.target.value : '');
}

function closeOpenMenu() {
  const menu = props.openMenu;
  if (!menu) return;
  emit('toggleMenu', menu);
  restoreMenuFocus(menu);
}

function selectSort(mode: SortMode) {
  emit('sort', mode);
  restoreMenuFocus('sort');
}

function applyFilters() {
  emit('applyFilters');
  restoreMenuFocus('filter');
}

function exportRows() {
  emit('exportRows');
  restoreMenuFocus('export');
}
</script>

<template>
  <div class="list-toolbar">
    <label class="list-search">
      <Search :size="16" />
      <input
        :value="search"
        type="search"
        :placeholder="searchPlaceholder"
        aria-label="搜索当前列表"
        title="搜索当前列表"
        @input="updateSearch"
      />
    </label>

    <div class="toolbar-actions" @click.stop @keydown.esc.stop="closeOpenMenu">
      <span v-if="showSort" class="toolbar-menu-wrap">
        <button
          ref="sortTrigger"
          class="filter-button"
          :class="{ active: openMenu === 'sort' }"
          type="button"
          title="排序当前列表"
          aria-haspopup="menu"
          aria-controls="business-list-sort-menu"
          :aria-expanded="openMenu === 'sort'"
          @click="emit('toggleMenu', 'sort')"
        >
          <ArrowDownUp :size="15" />
          排序
        </button>
        <span
          v-if="openMenu === 'sort'"
          id="business-list-sort-menu"
          class="toolbar-popover"
          role="menu"
          aria-labelledby="business-list-sort-title"
        >
          <strong id="business-list-sort-title">排序方式</strong>
          <button type="button" role="menuitem" :title="newestSortLabel || `按${sortDateLabel || '日期'}从新到旧排序`" :class="{ active: sortMode === 'newest' }" @click="selectSort('newest')">
            {{ newestSortLabel || `${sortDateLabel || '日期'}从新到旧` }}
          </button>
          <button type="button" role="menuitem" :title="oldestSortLabel || `按${sortDateLabel || '日期'}从旧到新排序`" :class="{ active: sortMode === 'oldest' }" @click="selectSort('oldest')">
            {{ oldestSortLabel || `${sortDateLabel || '日期'}从旧到新` }}
          </button>
          <button v-if="showAmountSort !== false" type="button" role="menuitem" :title="sortAmountLabel" :class="{ active: sortMode === 'amountDesc' }" @click="selectSort('amountDesc')">
            {{ sortAmountLabel }}
          </button>
          <button
            v-if="showStatusSort"
            type="button"
            role="menuitem"
            :title="statusSortLabel || '按状态优先排序'"
            :class="{ active: sortMode === 'status' }"
            @click="selectSort('status')"
          >
            {{ statusSortLabel || '状态优先' }}
          </button>
        </span>
      </span>

      <span class="toolbar-menu-wrap">
        <button
          ref="filterTrigger"
          class="filter-button"
          :class="{ active: openMenu === 'filter' || activeFilterCount }"
          type="button"
          :title="activeFilterCount ? `筛选当前列表，已选 ${activeFilterCount} 项` : '筛选当前列表'"
          aria-haspopup="dialog"
          aria-controls="business-list-filter-popover"
          :aria-expanded="openMenu === 'filter'"
          @click="emit('toggleMenu', 'filter')"
        >
          <SlidersHorizontal :size="15" />
          筛选
          <i v-if="activeFilterCount" class="filter-badge">{{ activeFilterCount }}</i>
        </button>
        <SalesFilterPopover
          v-if="openMenu === 'filter'"
          :status="filterStatus"
          :party="filterParty"
          :owner="filterOwner"
          :date-start="filterDateStart"
          :date-end="filterDateEnd"
          :fields="filterFields"
          :date-label="filterDateLabel"
          @update:status="emit('update:filterStatus', $event)"
          @update:party="emit('update:filterParty', $event)"
          @update:owner="emit('update:filterOwner', $event)"
          @update:date-start="emit('update:filterDateStart', $event)"
          @update:date-end="emit('update:filterDateEnd', $event)"
          @clear="emit('clearFilters')"
          @apply="applyFilters"
        />
      </span>

      <span class="toolbar-menu-wrap">
        <button
          ref="exportTrigger"
          class="secondary-action"
          :class="{ active: openMenu === 'export' }"
          type="button"
          title="导出当前列表"
          aria-haspopup="menu"
          aria-controls="business-list-export-menu"
          :aria-expanded="openMenu === 'export'"
          @click="emit('toggleMenu', 'export')"
        >
          <Download :size="15" />
          导出
        </button>
        <span
          v-if="openMenu === 'export'"
          id="business-list-export-menu"
          class="toolbar-popover align-right"
          role="menu"
          aria-labelledby="business-list-export-title"
        >
          <strong id="business-list-export-title">导出范围</strong>
          <button type="button" role="menuitem" title="按当前搜索、筛选和排序导出" @click="exportRows">导出</button>
          <span class="popover-note">按当前搜索、筛选和排序导出。</span>
        </span>
      </span>
    </div>
  </div>
</template>
