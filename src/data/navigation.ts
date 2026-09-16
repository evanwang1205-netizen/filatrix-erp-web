import {
  BadgeCheck,
  Boxes,
  Building2,
  ClipboardCheck,
  Factory,
  FileCog,
  Home,
  ShoppingBag,
  Store,
  Truck,
} from 'lucide-vue-next';
import type { Component } from 'vue';

import systemMenuDefaults from '../../shared/system-menu-defaults.json';

export interface NavChild {
  label: string;
  path: string;
  group?: string;
}

export interface NavItem {
  label: string;
  key: string;
  path: string;
  icon: Component;
  children?: NavChild[];
}

type SharedMenuDefault = {
  name: string;
  menuKey: string;
  path: string;
  enabledByDefault?: boolean;
  children?: Array<{
    name: string;
    path: string;
    group?: string;
  }>;
};

const moduleIcons: Record<string, Component> = {
  sales: ShoppingBag,
  purchase: Truck,
  warehouse: Boxes,
  production: Factory,
  production2: Factory,
  quality: BadgeCheck,
  ecommerce: Store,
  equipment: ClipboardCheck,
  'master-data': Building2,
  system: FileCog,
};

export const navItems: NavItem[] = [
  {
    label: '首页',
    key: 'home',
    path: '/',
    icon: Home,
  },
  ...(systemMenuDefaults as SharedMenuDefault[]).map((menu) => ({
    label: menu.name,
    key: menu.menuKey,
    path: menu.path,
    icon: moduleIcons[menu.menuKey] || FileCog,
    children: menu.children?.map((child) => ({
      label: child.name,
      path: child.path,
      group: child.group,
    })),
  })),
];

export const activeNavItems = navItems;
