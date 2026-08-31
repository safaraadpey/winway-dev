"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DevRegistrationCampaignList from "@/components/dev-panel/DevRegistrationCampaignList";
import DevTournamentRegisterForm from "@/components/dev-panel/DevTournamentRegisterForm";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import {
  cancelTournamentRegistrationCampaign,
  loadRegistrationCampaignDetail,
  loadTournamentRegisterOverview,
} from "@/services/dev-panel/tournament-register-client";
import type {
  DevRegistrationCampaignSummary,
  DevRegistrationScheduleRow,
  DevTournamentRegisterTournament,
} from "@/src/types/dev-tournament-register";

type ViewMode = "list" | "create";

export default function DevTournamentRegisterManager() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tournaments, setTournaments] = useState<DevTournamentRegisterTournament[]>([]);
  const [campaigns, setCampaigns] = useState<DevRegistrationCampaignSummary[]>([]);
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<DevRegistrationScheduleRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/dev-panel/dashboard"));
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [router, setShowHeader, setShowBackButton, setOnBackClick]);

  const refreshOverview = useCallback(async () => {
    const overview = await loadTournamentRegisterOverview();
    setTournaments(overview.tournaments);
    setCampaigns(overview.campaigns);
  }, []);

  useEffect(() => {
    async function bootstrap() {
      setLoading(true);
      try {
        await refreshOverview();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "خطا در بارگذاری");
      } finally {
        setLoading(false);
      }
    }
    void bootstrap();
  }, [refreshOverview]);

  const handleExpandCampaign = async (campaignId: string) => {
    setExpandedCampaignId(campaignId);
    setLoadingDetail(true);
    try {
      const detail = await loadRegistrationCampaignDetail(campaignId);
      setDetailItems(detail.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در بارگذاری جزئیات");
      setDetailItems([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCancelCampaign = async (campaignId: string) => {
    setSubmitting(true);
    try {
      const result = await cancelTournamentRegistrationCampaign({ campaignId });
      toast.success(`${result.summary.cancelled ?? 0} ثبت‌نام در صف لغو شد`);
      if (expandedCampaignId === campaignId) {
        setExpandedCampaignId(null);
        setDetailItems([]);
      }
      await refreshOverview();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در لغو کمپین");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSuccess = async () => {
    setViewMode("list");
    await refreshOverview();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0E0E0F] p-4 text-center text-sm text-gray-400">
        در حال بارگذاری...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4">
      <div className="mx-auto max-w-2xl">
        {viewMode === "list" ? (
          <DevRegistrationCampaignList
            campaigns={campaigns}
            expandedCampaignId={expandedCampaignId}
            detailItems={detailItems}
            loadingDetail={loadingDetail}
            submitting={submitting}
            onRefresh={() => void refreshOverview()}
            onCreateNew={() => setViewMode("create")}
            onExpand={(campaignId) => void handleExpandCampaign(campaignId)}
            onCollapse={() => {
              setExpandedCampaignId(null);
              setDetailItems([]);
            }}
            onCancel={(campaignId) => void handleCancelCampaign(campaignId)}
          />
        ) : (
          <DevTournamentRegisterForm
            tournaments={tournaments}
            submitting={submitting}
            onSubmittingChange={setSubmitting}
            onSuccess={() => void handleCreateSuccess()}
            onCancel={() => setViewMode("list")}
          />
        )}
      </div>
    </div>
  );
}
