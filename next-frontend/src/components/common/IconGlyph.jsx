"use client";

import React from 'react';
import {
  Award,
  ArrowRight,
  Bookmark,
  Calendar,
  Camera,
  Compass,
  Clock,
  Facebook,
  Globe,
  Google,
  Image,
  Instagram,
  Mail,
  Map,
  MapPin,
  Mountain,
  Pinterest,
  Play,
  Route,
  Shield,
  Sun,
  Sparkles
} from '@components/icons';

const ICONS = {
  Award,
  ArrowRight,
  Bookmark,
  Calendar,
  Camera,
  Compass,
  Clock,
  Facebook,
  Globe,
  Google,
  Image,
  Instagram,
  Mail,
  Map,
  MapPin,
  Mountain,
  Pinterest,
  Play,
  Route,
  Shield,
  Sun,
  Sparkles,
};

export default function IconGlyph({ name, className = '', style }) {
  const Icon = ICONS[name];

  if (!Icon) {
    return null;
  }

  return <Icon className={className} style={style} />;
}
