import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Play, Square, Trash2, Shield, Activity, Bot, Users, BarChart3, LogOut, Gift, Smartphone, Key, Send } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { BotInstance, Activity as ActivityType } from "@shared/schema";
import MasterControlPanel from "@/components/master-control-panel";
import ServerConfigModal from "@/components/server-config-modal";
import ServerOverviewDashboard from "@/components/server-overview-dashboard";
import { OfferManagement } from "@/components/offer-management";

export default function AdminConsole() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const [showMasterControl, setShowMasterControl] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [guestPhoneInput, setGuestPhoneInput] = useState("");
  const [guestSession, setGuestSession] = useState<any>(null);

  // Fetch all bot instances
  const { data: botInstances = [], isLoading: loadingBots } = useQuery({
    queryKey: ["/api/admin/bot-instances"],
    queryFn: async () => {
      const response = await fetch("/api/admin/bot-instances", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch bot instances");
      return await response.json() as BotInstance[];
    },
  });

  // Fetch recent activities across all bots
  const { data: activities = [], isLoading: loadingActivities } = useQuery({
    queryKey: ["/api/admin/activities"],
    queryFn: async () => {
      const response = await fetch("/api/admin/activities", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch activities");
      return await response.json() as ActivityType[];
    },
  });

  // Fetch system stats
  const { data: stats } = useQuery({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      const response = await fetch("/api/admin/stats", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch stats");
      return response.json();
    },
  });

  // Fetch server info for configuration
  const { data: serverInfo = {} } = useQuery({
    queryKey: ["/api/server/info"],
  });

  // Bot control mutations
  const startBotMutation = useMutation({
    mutationFn: async (botId: string) => {
      const response = await fetch(`/api/admin/bot-instances/${botId}/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to start bot");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bot-instances"] });
      toast({ title: "Bot started successfully" });
    },
    onError: () => {
      toast({ title: "Failed to start bot", variant: "destructive" });
    },
  });

  const stopBotMutation = useMutation({
    mutationFn: async (botId: string) => {
      const response = await fetch(`/api/admin/bot-instances/${botId}/stop`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to stop bot");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bot-instances"] });
      toast({ title: "Bot stopped successfully" });
    },
    onError: () => {
      toast({ title: "Failed to stop bot", variant: "destructive" });
    },
  });

  const deleteBotMutation = useMutation({
    mutationFn: async (botId: string) => {
      const response = await fetch(`/api/admin/bot-instances/${botId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to delete bot");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bot-instances"] });
      toast({ title: "Bot deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete bot", variant: "destructive" });
    },
  });

  // Guest Management Mutations
  const getSessionMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const cleanedPhone = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
      const response = await fetch(`/api/guest/session/${cleanedPhone}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to retrieve session");
      return response.json();
    },
    onSuccess: (data) => {
      setGuestSession(data);
      toast({ title: "Session retrieved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to retrieve guest session", variant: "destructive" });
    },
  });

  const checkRegistrationMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const cleanedPhone = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
      const response = await fetch("/api/guest/check-registration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ phoneNumber: cleanedPhone }),
      });
      if (!response.ok) throw new Error("Failed to check registration");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Registration status retrieved" });
    },
    onError: () => {
      toast({ title: "Failed to check registration", variant: "destructive" });
    },
  });

  const sendOTPMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const cleanedPhone = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
      const response = await fetch("/api/guest/auth/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ phoneNumber: cleanedPhone }),
      });
      if (!response.ok) throw new Error("Failed to send OTP");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "OTP sent successfully" });
    },
    onError: () => {
      toast({ title: "Failed to send OTP", variant: "destructive" });
    },
  });

  const getStatusBadge = (status: string) => {
    const variants = {
      online: "default",
      offline: "secondary",
      loading: "outline",
      error: "destructive",
      qr_code: "outline",
    } as const;

    return (
      <Badge 
        variant={variants[status as keyof typeof variants] || "secondary"}
        data-testid={`status-${status}`}
      >
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleString();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-red-600" />
          <h1 className="text-3xl font-bold" data-testid="admin-console-title">
            Admin Console
          </h1>
        </div>
        <Button 
          variant="outline" 
          onClick={() => {
            logout();
            window.location.href = '/';
          }}
          className="flex items-center gap-2"
          data-testid="button-logout-admin"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bots</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="total-bots">
              {stats?.totalBots || botInstances.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online Bots</CardTitle>
            <Activity className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="online-bots">
              {botInstances.filter(bot => bot.status === "online").length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="total-messages">
              {botInstances.reduce((sum, bot) => sum + (bot.messagesCount || 0), 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Commands Used</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="total-commands">
              {botInstances.reduce((sum, bot) => sum + (bot.commandsCount || 0), 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Server Overview</TabsTrigger>
          <TabsTrigger value="bots" data-testid="tab-bots">Bot Management</TabsTrigger>
          <TabsTrigger value="guest" data-testid="tab-guest">Guest Management</TabsTrigger>
          <TabsTrigger value="activities" data-testid="tab-activities">Recent Activity</TabsTrigger>
          <TabsTrigger value="server" data-testid="tab-server">Server Config</TabsTrigger>
          <TabsTrigger value="offer" data-testid="tab-offer">
            <Gift className="h-4 w-4 mr-2" />
            Promotional Offers
          </TabsTrigger>
          <TabsTrigger value="master" data-testid="tab-master">Master Control</TabsTrigger>
        </TabsList>

        {/* Server Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <ServerOverviewDashboard />
        </TabsContent>

        <TabsContent value="bots" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bot Instance Management</CardTitle>
              <CardDescription>
                Manage all WhatsApp bot instances across the system
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingBots ? (
                <div className="text-center py-8">Loading bot instances...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Messages</TableHead>
                      <TableHead>Commands</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {botInstances.map((bot) => (
                      <TableRow key={bot.id}>
                        <TableCell className="font-medium" data-testid={`bot-name-${bot.id}`}>
                          {bot.name}
                        </TableCell>
                        <TableCell data-testid={`bot-phone-${bot.id}`}>
                          {bot.phoneNumber || "Not set"}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(bot.status)}
                        </TableCell>
                        <TableCell data-testid={`bot-messages-${bot.id}`}>
                          {bot.messagesCount || 0}
                        </TableCell>
                        <TableCell data-testid={`bot-commands-${bot.id}`}>
                          {bot.commandsCount || 0}
                        </TableCell>
                        <TableCell data-testid={`bot-activity-${bot.id}`}>
                          {bot.lastActivity ? formatDate(bot.lastActivity) : "Never"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {bot.status === "offline" || bot.status === "error" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startBotMutation.mutate(bot.id)}
                                disabled={startBotMutation.isPending}
                                data-testid={`button-start-${bot.id}`}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => stopBotMutation.mutate(bot.id)}
                                disabled={stopBotMutation.isPending}
                                data-testid={`button-stop-${bot.id}`}
                              >
                                <Square className="h-4 w-4" />
                              </Button>
                            )}
                            
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  data-testid={`button-delete-${bot.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Bot Instance</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{bot.name}"? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteBotMutation.mutate(bot.id)}
                                    data-testid={`confirm-delete-${bot.id}`}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Guest Management Tab */}
        <TabsContent value="guest" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Guest Session Management
              </CardTitle>
              <CardDescription>
                Manage guest bot sessions, retrieve credentials, and send OTPs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Phone Number Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Enter Guest Phone Number</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter phone number (e.g., 254704897825)"
                    value={guestPhoneInput}
                    onChange={(e) => setGuestPhoneInput(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    data-testid="input-guest-phone"
                  />
                </div>
              </div>

              {/* Guest Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Button
                  onClick={() => getSessionMutation.mutate(guestPhoneInput)}
                  disabled={!guestPhoneInput || getSessionMutation.isPending}
                  className="flex items-center gap-2"
                  data-testid="button-get-session"
                >
                  <Key className="h-4 w-4" />
                  Get Session
                </Button>
                
                <Button
                  onClick={() => checkRegistrationMutation.mutate(guestPhoneInput)}
                  disabled={!guestPhoneInput || checkRegistrationMutation.isPending}
                  variant="outline"
                  className="flex items-center gap-2"
                  data-testid="button-check-registration"
                >
                  <Smartphone className="h-4 w-4" />
                  Check Registration
                </Button>

                <Button
                  onClick={() => sendOTPMutation.mutate(guestPhoneInput)}
                  disabled={!guestPhoneInput || sendOTPMutation.isPending}
                  variant="secondary"
                  className="flex items-center gap-2"
                  data-testid="button-send-otp"
                >
                  <Send className="h-4 w-4" />
                  Send OTP
                </Button>
              </div>

              {/* Session Display */}
              {guestSession && (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <h4 className="font-medium mb-3">Retrieved Session</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Session ID:</span>
                      <p className="font-mono text-xs bg-background p-2 rounded mt-1 break-all max-h-24 overflow-y-auto" data-testid="text-session-id">
                        {guestSession.sessionId?.substring(0, 100)}...
                      </p>
                    </div>
                    {guestSession.pairingCode && (
                      <div>
                        <span className="text-muted-foreground">Pairing Code:</span>
                        <p className="font-mono text-sm bg-background p-2 rounded mt-1" data-testid="text-pairing-code">
                          {guestSession.pairingCode}
                        </p>
                      </div>
                    )}
                    {guestSession.createdAt && (
                      <div>
                        <span className="text-muted-foreground">Created:</span>
                        <p data-testid="text-session-created">{formatDate(guestSession.createdAt)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activities" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Activity Monitor</CardTitle>
              <CardDescription>
                Recent activities across all bot instances
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingActivities ? (
                <div className="text-center py-8">Loading activities...</div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto" data-testid="activities-list">
                  {activities.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No recent activities
                    </div>
                  ) : (
                    activities.map((activity) => (
                      <div key={activity.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" data-testid={`activity-type-${activity.type}`}>
                            {activity.type.replace("_", " ").toUpperCase()}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {formatDate(activity.createdAt!)}
                          </span>
                        </div>
                        <p className="text-sm" data-testid={`activity-description-${activity.id}`}>
                          {activity.description}
                        </p>
{activity.metadata && typeof activity.metadata === 'object' && Object.keys(activity.metadata as object).length > 0 ? (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground">
                              View details
                            </summary>
                            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                              {JSON.stringify(activity.metadata, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="server" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Server Configuration</CardTitle>
              <CardDescription>
                Configure server settings and tenancy management
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">Current Server</h4>
                    <p className="text-2xl font-bold text-primary">{(serverInfo as any)?.serverName || 'default-server'}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Bot Slots: {(serverInfo as any)?.currentBots || 0}/{(serverInfo as any)?.maxBots || 0}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">Configuration Status</h4>
                    <p className="text-sm">
                      {(serverInfo as any)?.hasSecretConfig ? (
                        <span className="text-green-600">✅ Environment Configured</span>
                      ) : (
                        <span className="text-yellow-600">⚠️ Manual Configuration</span>
                      )}
                    </p>
                  </div>
                </div>
                
                <Button 
                  onClick={() => setShowServerConfig(true)}
                  className="w-full"
                  data-testid="button-configure-server-admin"
                >
                  ⚙️ Configure Server Settings
                </Button>
                <p className="text-sm text-muted-foreground text-center">
                  Switch between server instances and manage tenancy settings
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="offer" className="space-y-4">
          <OfferManagement />
        </TabsContent>

        <TabsContent value="master" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Master Control Panel</CardTitle>
              <CardDescription>
                Cross-tenancy bot management using God Registry
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => setShowMasterControl(true)}
                className="w-full"
                data-testid="button-open-master-control"
              >
                🎛️ Open Master Control Panel
              </Button>
              <p className="text-sm text-muted-foreground mt-2 text-center">
                Manage bots across all tenancies from a centralized interface
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <MasterControlPanel 
        open={showMasterControl} 
        onClose={() => setShowMasterControl(false)} 
      />

      <ServerConfigModal
        open={showServerConfig}
        onOpenChange={setShowServerConfig}
        currentServerName={(serverInfo as any)?.serverName || ""}
        hasSecretConfig={(serverInfo as any)?.hasSecretConfig || false}
      />
    </div>
  );
}