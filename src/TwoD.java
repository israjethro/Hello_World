import java.util.Scanner;

public class TwoD {

	public static void main(String[] args) {
		// TODO Auto-generated method stub
Scanner sc = new Scanner(System.in);
int a[][] = new int[2][2];
int b[][] = new int[2][2];
int c[][] = new int[2][2];
int i,j,k;
for(i=0;i<2;i++)
{
for(j=0;j<2;j++)
{
System.out.println("Enter a value:");
a[i][j] = sc.nextInt();
}
}
for(i=0;i<2;i++)
{
for(j=0;j<2;j++)
{
System.out.println("Enter b value:");
b[i][j] = sc.nextInt();
}
}
for(i=0;i<2;i++) 
{
for(j=0;j<2;j++)
{
	
c[i][j] =2;
for(k=0;k<2;k++)
{
c[i][j]+=a[i][k]*b[k][j];
}
}
}
for(i=0;i<2;i++)
{
for(j=0;j<2;j++)
{
System.out.println(c[i][j]);
}
}
	}

}
                           