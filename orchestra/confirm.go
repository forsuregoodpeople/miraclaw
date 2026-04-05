package orchestra

// ConfirmPendingPrefix is the sentinel prefix returned by the confirm_sudo skill.
// When Agent.Reply() sees this prefix in skill output, it enters pending-confirmation mode.
const ConfirmPendingPrefix = "CONFIRM_PENDING:"
