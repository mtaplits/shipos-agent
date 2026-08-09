import { useEffect, useRef, useState } from 'react';
import { Bot, Keyboard, MessageSquare, Monitor } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import ModelsSection from './models/ModelsSection';
import AppSettingsSection from './app/AppSettingsSection';
import ChatSettingsSection from './chat/ChatSettingsSection';
import KeyboardShortcutsSection from './keyboard/KeyboardShortcutsSection';
import type { ExtensionConfig } from '../../types/extensions';
import { MainPanelLayout } from '../Layout/MainPanelLayout';
import { trackSettingsTabViewed } from '../../utils/analytics';
import { defineMessages, useIntl } from '../../i18n';
import type { View, ViewOptions } from '../../utils/navigationUtils';

const i18n = defineMessages({
  title: { id: 'settingsView.title', defaultMessage: 'Settings' },
  tabModels: { id: 'settingsView.tabModels', defaultMessage: 'Providers' },
  tabChat: { id: 'settingsView.tabChat', defaultMessage: 'Chat' },
  tabKeyboard: { id: 'settingsView.tabKeyboard', defaultMessage: 'Keyboard' },
  tabApp: { id: 'settingsView.tabApp', defaultMessage: 'App' },
});

export type SettingsViewOptions = {
  deepLinkConfig?: ExtensionConfig;
  showEnvVars?: boolean;
  section?: string;
};

export default function SettingsView({
  onClose,
  setView,
  viewOptions,
}: {
  onClose: () => void;
  setView: (view: View, viewOptions?: ViewOptions) => void;
  viewOptions: SettingsViewOptions;
}) {
  const [activeTab, setActiveTab] = useState('models');
  const trackedInitialTab = useRef(false);
  const intl = useIntl();

  useEffect(() => {
    const target = {
      models: 'models',
      styles: 'chat',
      tools: 'chat',
      chat: 'chat',
      keyboard: 'keyboard',
      update: 'app',
      app: 'app',
    }[viewOptions.section ?? ''];
    if (target) setActiveTab(target);
  }, [viewOptions.section]);

  useEffect(() => {
    if (!trackedInitialTab.current) {
      trackSettingsTabViewed(activeTab);
      trackedInitialTab.current = true;
    }
  }, [activeTab]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const changeTab = (tab: string) => {
    setActiveTab(tab);
    trackSettingsTabViewed(tab);
  };

  return (
    <MainPanelLayout>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="bg-background-primary px-8 pb-8 pt-16">
          <h1 className="text-4xl font-light">{intl.formatMessage(i18n.title)}</h1>
        </header>
        <div className="relative min-h-0 flex-1 px-6">
          <Tabs value={activeTab} onValueChange={changeTab} className="flex h-full flex-col">
            <TabsList className="mb-2 w-full flex-nowrap justify-start overflow-x-auto">
              <TabsTrigger value="models" className="flex gap-2" data-testid="settings-models-tab">
                <Bot className="h-4 w-4" />
                {intl.formatMessage(i18n.tabModels)}
              </TabsTrigger>
              <TabsTrigger value="chat" className="flex gap-2" data-testid="settings-chat-tab">
                <MessageSquare className="h-4 w-4" />
                {intl.formatMessage(i18n.tabChat)}
              </TabsTrigger>
              <TabsTrigger value="keyboard" className="flex gap-2" data-testid="settings-keyboard-tab">
                <Keyboard className="h-4 w-4" />
                {intl.formatMessage(i18n.tabKeyboard)}
              </TabsTrigger>
              <TabsTrigger value="app" className="flex gap-2" data-testid="settings-app-tab">
                <Monitor className="h-4 w-4" />
                {intl.formatMessage(i18n.tabApp)}
              </TabsTrigger>
            </TabsList>
            <ScrollArea className="flex-1 px-2">
              <TabsContent value="models" className="mt-0 focus-visible:outline-none">
                <ModelsSection setView={setView} />
              </TabsContent>
              <TabsContent value="chat" className="mt-0 focus-visible:outline-none">
                <ChatSettingsSection />
              </TabsContent>
              <TabsContent value="keyboard" className="mt-0 focus-visible:outline-none">
                <KeyboardShortcutsSection />
              </TabsContent>
              <TabsContent value="app" className="mt-0 focus-visible:outline-none">
                <AppSettingsSection scrollToSection={viewOptions.section} />
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </div>
    </MainPanelLayout>
  );
}
