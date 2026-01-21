import MembershipSuccess from '@/components/membership-success';

export const metadata = {
  title: 'Welcome to Membership',
  description: 'Your membership is now active. Start shopping at $0 checkout.',
};

export default function SuccessPage() {
  return <MembershipSuccess />;
}
