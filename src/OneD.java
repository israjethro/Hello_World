import java.util.Scanner;

public class OneD {

	public static void main(String[] args) {
		// TODO Auto-generated method stub
int a[] = new int[5];
Scanner sc = new Scanner(System.in);
int i,sum=0;
for(i=0;i<5;i++)
{
a[i] = sc.nextInt();
}
for(i=0;i<5;i++)
{
sum = sum+a[i];
System.out.println(sum);
}
	}

}
