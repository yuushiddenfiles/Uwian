import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function Join() {
  const { gid } = useParams();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const r = await api(`/api/groups/${Number(gid)}/join`, {});
        toast.success(
          r.status === "active"
            ? "You are already in. Welcome back."
            : "Request sent. Waiting for someone to vouch for you."
        );
      } catch (e) {
        toast.error(e.message);
      }
      navigate(`/groups/${gid}`, { replace: true });
    })();
  }, [gid, navigate ]);

  return <p className="py-10 text-center text-background">Joining crew.</p>;
}
