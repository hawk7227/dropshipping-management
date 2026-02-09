import MembershipCheckout from '@/components/membership-checkout';

export const metadata = {
  title: 'Join Membership',
  description: 'Complete your membership signup to start paying $0 at checkout.',
};

export default function CheckoutPage() {
  return <MembershipCheckout />;
}
